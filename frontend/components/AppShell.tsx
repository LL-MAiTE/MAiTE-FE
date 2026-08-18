"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

/**
 * 공용 앱 셸 (탑바 + 사이드바 + 메인 콘텐츠 영역).
 * Figma 홈 대시보드(1:7)의 TopNav(1:1419)/Sidebar(1:1275) 노드를 기반으로 만들었다.
 *
 * 라우팅 모델상 "홈"과 "프로젝트 목록"이 같은 페이지(`/`)라서 두 항목 모두 그 경로로
 * 연결한다. "회의"는 프로젝트를 가로지르는 전체 회의 목록(`/meetings`)으로 연결된다 —
 * Figma의 "회의_전체/준비중/승인완료/진행중/후속답변대기/종료" 노드들이 실제로는 전부
 * 이 목록 화면의 상태 탭 스크린샷이었다.
 *
 * 보류항목/필수검토는 백엔드에 "여러 프로젝트 통틀어 조회" 엔드포인트가 아직 없어서,
 * 로컬(mock) 데이터를 모아 보여주는 전역 화면(`/hold-items`, `/mandatory-reviews`)으로
 * 연결한다 — 배지 숫자와 같은 데이터 소스다. 설정(`/settings`)은 대응하는 데이터가
 * 없어 정적 미리보기 화면으로 연결한다.
 *
 * 알림(종 아이콘)은 백엔드에 이미 구현돼 있어서(GET /notifications 등) 실제로 연결했다 —
 * 로그인이 없는 스코프라 고정 서비스 계정의 알림함을 그대로 보여준다.
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
    href: "/",
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
  const pathname = usePathname();

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
              <div className="app-sidebar-avatar">재</div>
              <div className="app-sidebar-name">재현</div>
              <div className="app-sidebar-role">Product Manager</div>
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
