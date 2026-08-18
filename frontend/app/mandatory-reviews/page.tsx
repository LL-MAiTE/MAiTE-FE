"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/Card";
import { Badge, MandatoryReviewStatusBadge } from "@/components/Badge";
import { MandatoryReviewItem, MandatoryReviewStatus } from "@/lib/types";

/**
 * 전체 필수 검토 항목 모아보기. hold-items 페이지와 동일한 이유로 로컬(mock) 데이터
 * 기준이다 — 실제 확인 처리는 각 회의의 결과 검토 화면에서 한다.
 */

type Tab = MandatoryReviewStatus | "전체";

const TABS: { key: Tab; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "확인전", label: "확인전" },
  { key: "확인후확정", label: "확인후확정" },
];

export default function MandatoryReviewsPage() {
  const { meetings, projects } = useStore();
  const [tab, setTab] = useState<Tab>("전체");

  const rows = useMemo(() => {
    const all: { item: MandatoryReviewItem; meetingId: string; meetingTitle: string; projectId: string }[] = [];
    for (const meeting of meetings) {
      for (const item of meeting.mandatoryReviewItems) {
        all.push({ item, meetingId: meeting.id, meetingTitle: meeting.title, projectId: meeting.projectId });
      }
    }
    return all.filter((row) => tab === "전체" || row.item.status === tab);
  }, [meetings, tab]);

  return (
    <div>
      <div className="page-header">
        <h1>필수검토</h1>
        <p className="muted">
          질문 참여자가 필수 검토로 지정한 항목을 모아봅니다. 확인 처리는 해당 회의의 결과 검토 화면에서 진행합니다.
        </p>
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
        <EmptyState title="필수 검토 항목이 없습니다" description="선택한 상태에 해당하는 항목이 없습니다." />
      ) : (
        rows.map(({ item, meetingId, meetingTitle, projectId }) => (
          <Link
            key={item.id}
            href={`/projects/${projectId}/meetings/${meetingId}/review`}
            className="list-row"
          >
            <span className="list-row-icon">
              <img src="/icons/nav-mandatory.svg" alt="" width={16} height={16} />
            </span>
            <div style={{ flex: 1 }}>
              <strong>{item.label}</strong>
              <p className="muted" style={{ margin: "2px 0 0" }}>
                {meetingTitle} · {projects.find((p) => p.id === projectId)?.name}
                {item.relatedTopic && ` · 관련 안건: ${item.relatedTopic}`}
              </p>
            </div>
            <div className="row">
              {item.requestedByCounterpart && <Badge tone="info">상대방 지정</Badge>}
              <MandatoryReviewStatusBadge status={item.status} />
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
