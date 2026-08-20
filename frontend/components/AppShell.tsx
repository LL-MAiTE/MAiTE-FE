"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

/**
 * 공용 앱 셸 (탑바 + 사이드바 + 메인 콘텐츠 영역).
 * Figma 홈 대시보드(1:7)의 TopNav(1:1419)/Sidebar(1:1275) 노드를 기반으로 만들었다.
 *
 * "프로젝트"는 전체 프로젝트 목록(`/projects`)으로 연결된다 — 예전엔 홈(`/`)의
 * `#projects` 섹션으로 스크롤만 시키는 앵커 링크였는데, pathname이 안 바뀌어 nav
 * 하이라이트가 절대 안 되고, 프로젝트 0개일 땐 스크롤할 것도 없어 클릭해도 아무
 * 반응이 없는 것처럼 보이는 버그가 있었다 — 그래서 독립 페이지로 분리함. "회의"도
 * 마찬가지로 프로젝트를 가로지르는 전체 회의 목록(`/meetings`)으로 연결된다 —
 * Figma의 "회의_전체/준비중/승인완료/진행중/후속답변대기/종료" 노드들이 실제로는 전부
 * 이 목록 화면의 상태 탭 스크린샷이었다.
 *
 * 보류항목/필수검토는 백엔드에 "여러 프로젝트 통틀어 조회" 엔드포인트가 아직 없어서,
 * 로컬(mock) 데이터를 모아 보여주는 전역 화면(`/hold-items`, `/mandatory-reviews`)으로
 * 연결한다 — 배지 숫자와 같은 데이터 소스다.
 *
 * 알림(종 아이콘)은 백엔드에 이미 구현돼 있어서(GET /notifications 등) 실제로 연결했다.
 * 사이드바 프로필은 lib/auth.tsx의 실제 로그인 사용자(user.name/email)를 보여준다 —
 * 다만 알림/프로젝트/회의 등 백엔드 데이터 호출 자체는 여전히 고정 서비스 계정 토큰
 * (BACKEND_API_TOKEN)을 쓴다 — 로그인은 "누가 접속했는지"만 구분할 뿐, 사용자별 데이터
 * 분리는 이번 스코프 밖이다. [[tkzr-scope-decisions]]
 */

interface NotificationItem {
  id: string;
  type: string;
  referenceId: string;
  referenceType: string;
  isRead: boolean;
  createdAt: string;
}

const NAV_ITEMS: {
  key: string;
  label: string;
  icon: string;
  href: string;
  activeMatch?: (pathname: string) => boolean;
  countKey?: "hold" | "mandatory";
}[] = [
  { key: "home", label: "홈", icon: "/icons/nav-home.svg", href: "/", activeMatch: (p) => p === "/" },
  {
    key: "projects",
    label: "프로젝트",
    icon: "/icons/nav-projects.svg",
    href: "/projects",
    activeMatch: (p) => p.startsWith("/projects"),
  },
  {
    key: "meetings",
    label: "회의",
    icon: "/icons/nav-meetings.svg",
    href: "/meetings",
    activeMatch: (p) => p.startsWith("/meetings"),
  },
  {
    key: "hold",
    label: "보류 항목",
    icon: "/icons/nav-hold.svg",
    href: "/hold-items",
    activeMatch: (p) => p.startsWith("/hold-items"),
    countKey: "hold",
  },
  {
    key: "mandatory",
    label: "필수검토",
    icon: "/icons/nav-mandatory.svg",
    href: "/mandatory-reviews",
    activeMatch: (p) => p.startsWith("/mandatory-reviews"),
    countKey: "mandatory",
  },
  {
    key: "settings",
    label: "설정",
    icon: "/icons/nav-settings.svg",
    href: "/settings",
    activeMatch: (p) => p.startsWith("/settings"),
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { projects, meetings } = useStore();
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    setNotifLoading(true);
    setNotifError(null);
    try {
      const res = await fetch("/api/backend/notifications");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotifications(data.notifications);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : String(err));
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await fetch("/api/backend/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
    } catch {
      // 실패해도 다음에 열 때 다시 불러오면 맞춰지니 조용히 무시
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await fetch("/api/backend/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // 위와 동일
    }
  };

  const completedMeetings = meetings.filter((m) => m.status === "종료").length;
  const pendingHoldCount = meetings.reduce(
    (sum, m) => sum + m.holdItems.filter((h) => h.status === "보류" || h.status === "후속답변대기").length,
    0
  );
  const pendingMandatoryCount = meetings.reduce(
    (sum, m) => sum + m.mandatoryReviewItems.filter((i) => i.status === "확인전").length,
    0
  );

  const countFor = (key?: "hold" | "mandatory") => {
    if (key === "hold") return pendingHoldCount;
    if (key === "mandatory") return pendingMandatoryCount;
    return 0;
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link href="/" className="app-brand">
          <span className="app-brand-mark">
            <Image src="/brand/maite-logo-mark.png" alt="" width={64} height={64} unoptimized />
          </span>
          <span className="app-brand-word">
            M<span className="grad">Ai</span>TE
          </span>
        </Link>
        <div className="app-topbar-actions">
          <div className="app-notif-wrap">
            <button
              className="app-icon-btn"
              type="button"
              title="알림"
              onClick={() => setNotifOpen((v) => !v)}
            >
              <img src="/icons/bell.svg" alt="알림" />
              {unreadCount > 0 && <span className="app-notif-dot">{unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className="app-notif-panel">
                <div className="app-notif-panel-header">
                  <strong>알림</strong>
                  {unreadCount > 0 && (
                    <button className="app-notif-mark-all" type="button" onClick={handleMarkAllRead}>
                      모두 읽음
                    </button>
                  )}
                </div>
                {notifLoading && <p className="muted" style={{ padding: "12px 16px" }}>불러오는 중…</p>}
                {notifError && (
                  <p style={{ padding: "12px 16px", color: "var(--tone-danger-fg)" }}>{notifError}</p>
                )}
                {!notifLoading && !notifError && notifications.length === 0 && (
                  <p className="muted" style={{ padding: "12px 16px" }}>알림이 없습니다.</p>
                )}
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`app-notif-item ${n.isRead ? "" : "unread"}`}
                    onClick={() => handleMarkRead(n.id)}
                  >
                    <span className="app-notif-item-type">{n.type}</span>
                    <span className="app-notif-item-meta">
                      {n.referenceType} · {new Date(n.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <div className="app-sidebar-profile-wrap">
            <div className="app-sidebar-profile">
              <div className="app-sidebar-avatar">{(user?.name ?? "?").charAt(0)}</div>
              <div className="app-sidebar-name">{user?.name ?? "게스트"}</div>
              <div className="app-sidebar-role">{user?.email ?? ""}</div>
              <div className="app-sidebar-status">
                <span className="app-sidebar-status-dot" />
                활동 중
              </div>
              <div className="app-sidebar-stats">
                <div className="app-sidebar-stat">
                  <strong>{projects.length}</strong>
                  <span>프로젝트</span>
                </div>
                <div className="app-sidebar-stat">
                  <strong>{completedMeetings}</strong>
                  <span>완료 회의</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm app-sidebar-logout"
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
              >
                로그아웃
              </button>
            </div>
          </div>

          <nav className="app-nav">
            {NAV_ITEMS.map((item) => {
              const isActive = item.activeMatch ? item.activeMatch(pathname ?? "") : false;
              const count = countFor(item.countKey);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`app-nav-item ${isActive ? "active" : ""}`}
                >
                  <span className="app-nav-icon">
                    <img src={item.icon} alt="" />
                  </span>
                  <span className="app-nav-item-label">{item.label}</span>
                  {count > 0 && <span className="app-nav-badge">{count}</span>}
                  {isActive && <span className="app-nav-dot" />}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="app-main container">{children}</main>
      </div>
    </div>
  );
}
