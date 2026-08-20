"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/Card";
import { HoldStatusBadge } from "@/components/Badge";
import { HoldItem, HoldItemStatus } from "@/lib/types";

/**
 * 전체 보류 항목 (프로젝트/회의를 가로지르는 모아보기).
 *
 * 백엔드에 "여러 프로젝트 통틀어 보류 항목 조회" 엔드포인트가 아직 없어서, 로그인 시
 * store가 각 회의별로 하이드레이션한 `meeting.holdItems`를 모아서 보여준다 — 라이브를
 * 한 번이라도 시작한 회의는 실제 백엔드 보류 항목이, 아직 로컬로만 존재하는 회의는
 * 시뮬레이션 값이 섞여서 나온다. 후속 답변 작성/재오픈 같은 실제 액션은 각 회의의
 * "결과 검토" 화면에서 하므로, 여기서는 목록만 보여주고 그 화면으로 연결한다.
 */

type Tab = HoldItemStatus | "전체";

const TABS: { key: Tab; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "보류", label: "보류" },
  { key: "후속답변대기", label: "후속답변대기" },
  { key: "확정", label: "확정" },
  { key: "실시간조율필요", label: "실시간조율필요" },
];

export default function HoldItemsPage() {
  const { meetings, projects } = useStore();
  const [tab, setTab] = useState<Tab>("전체");

  const rows = useMemo(() => {
    const all: { item: HoldItem; meetingId: string; meetingTitle: string; projectId: string }[] = [];
    for (const meeting of meetings) {
      for (const item of meeting.holdItems) {
        all.push({ item, meetingId: meeting.id, meetingTitle: meeting.title, projectId: meeting.projectId });
      }
    }
    return all
      .filter((row) => tab === "전체" || row.item.status === tab)
      .sort((a, b) => (a.item.followupDeadline ?? "").localeCompare(b.item.followupDeadline ?? ""));
  }, [meetings, tab]);

  return (
    <div>
      <div className="page-header">
        <h1>보류함</h1>
        <p className="muted">모든 회의의 보류 항목을 모아봅니다. 후속 답변 작성은 해당 회의의 결과 검토 화면에서 진행합니다.</p>
      </div>

      <div className="tab-list">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-button ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="보류 항목이 없습니다" description="선택한 상태에 해당하는 보류 항목이 없습니다." />
      ) : (
        rows.map(({ item, meetingId, meetingTitle, projectId }) => (
          <Link
            key={item.id}
            href={`/projects/${projectId}/meetings/${meetingId}/review`}
            className="list-row"
          >
            <span className="list-row-icon">
              <img src="/icons/nav-hold.svg" alt="" width={16} height={16} />
            </span>
            <div style={{ flex: 1 }}>
              <strong>{item.relatedTopic ?? item.reason ?? "(사유 미상)"}</strong>
              <p className="muted" style={{ margin: "2px 0 0" }}>
                {meetingTitle} · {projects.find((p) => p.id === projectId)?.name}
              </p>
            </div>
            <HoldStatusBadge status={item.status} />
          </Link>
        ))
      )}
    </div>
  );
}
