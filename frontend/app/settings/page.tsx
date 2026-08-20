"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { useAuth } from "@/lib/auth";

/**
 * 설정 화면. 프로필 카드는 이제 lib/auth.tsx의 실제 로그인 사용자를 보여준다.
 * 알림 설정 토글은 대응하는 백엔드 API가 아직 없어([[tkzr-scope-decisions]]) 여전히
 * "준비 중" 정적 표시로 남겨뒀다 — 로그인/계정 자체는 실제로 동작한다.
 */
export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div>
      <div className="page-header">
        <h1>설정</h1>
        <p className="muted">계정 정보와 알림 설정을 관리하세요.</p>
      </div>

      <Card>
        <h3>프로필</h3>
        <div className="row-between" style={{ marginTop: 8, alignItems: "center" }}>
          <div className="row" style={{ gap: 16 }}>
            <div className="app-sidebar-avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
              {(user?.name ?? "?").charAt(0)}
            </div>
            <div>
              <strong style={{ fontSize: 16 }}>{user?.name ?? "게스트"}</strong>
              <p className="muted" style={{ margin: "2px 0 0" }}>{user?.email ?? ""}</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            로그아웃
          </button>
        </div>
      </Card>

      <Card>
        <h3>알림 설정</h3>
        <div className="stack">
          <SettingRow label="새 보류 항목 알림" description="보류 항목이 생기면 알림을 받습니다." />
          <SettingRow label="필수검토 지정 알림" description="상대방이 필수 검토를 지정하면 알림을 받습니다." />
          <SettingRow label="타임아웃 임박 알림" description="24~48시간 자동확정 시한이 다가오면 알림을 받습니다." />
        </div>
      </Card>
    </div>
  );
}

function SettingRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="row-between">
      <div>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <p className="muted" style={{ margin: "2px 0 0" }}>
          {description}
        </p>
      </div>
      <span className="muted" title="알림 설정 API가 아직 없어 연결 전입니다">
        준비 중
      </span>
    </div>
  );
}
