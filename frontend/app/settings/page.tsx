"use client";

import { Card } from "@/components/Card";

/**
 * 설정 화면. 로그인이 없는 스코프라([[tkzr-scope-decisions]]) 실제 대응하는 데이터/기능이
 * 없다 — 사이드바 프로필과 같은 하드코딩 값을 보여주는 정적 화면이다. 나중에 실제 계정
 * 시스템이 붙으면 이 화면에 진짜 값/토글을 연결하면 된다.
 */
export default function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <h1>설정</h1>
        <p className="muted">지금은 미리보기 화면입니다 — 실제 계정 시스템이 붙으면 여기서 관리하게 됩니다.</p>
      </div>

      <Card>
        <h3>프로필</h3>
        <div className="row" style={{ gap: 16, marginTop: 8 }}>
          <div className="app-sidebar-avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
            재
          </div>
          <div>
            <strong style={{ fontSize: 16 }}>재현</strong>
            <p className="muted" style={{ margin: "2px 0 0" }}>Product Manager</p>
          </div>
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
      <span className="muted" title="계정 시스템이 붙으면 연결됩니다">
        준비 중
      </span>
    </div>
  );
}
