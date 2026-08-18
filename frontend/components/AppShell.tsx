"use client";

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
 * 이 목록 화면의 상태 탭 스크린샷이었다. 보류 항목/필수검토/설정은 이번 스코프에서
 * 명시적으로 제외된 화면이라 별도 전역 라우트를 만들지 않고 비활성 항목으로 시각만
 * 표시한다 — 배지 숫자는 실제 store 데이터를 집계해서 보여준다.
 */

const NAV_ITEMS: {
  key: string;
  label: string;
  icon: string;
  href?: string;
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
  { key: "hold", label: "보류 항목", icon: "/icons/nav-hold.svg", countKey: "hold" },
  { key: "mandatory", label: "필수검토", icon: "/icons/nav-mandatory.svg", countKey: "mandatory" },
  { key: "settings", label: "설정", icon: "/icons/nav-settings.svg" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { projects, meetings } = useStore();
  const pathname = usePathname();

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
          <button className="app-icon-btn" type="button" title="알림 (이번 스코프에서 제외)" disabled>
            <img src="/icons/bell.svg" alt="알림" />
          </button>
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
              if (item.href) {
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
                    {isActive && <span className="app-nav-dot" />}
                  </Link>
                );
              }
              return (
                <span
                  key={item.key}
                  className="app-nav-item disabled"
                  title="프로젝트 상세 화면에서 확인할 수 있습니다 (이번 스코프에서는 별도 전역 화면 없음)"
                >
                  <span className="app-nav-icon">
                    <img src={item.icon} alt="" />
                  </span>
                  <span className="app-nav-item-label">{item.label}</span>
                  {count > 0 && <span className="app-nav-badge">{count}</span>}
                </span>
              );
            })}
          </nav>
        </aside>

        <main className="app-main container">{children}</main>
      </div>
    </div>
  );
}
