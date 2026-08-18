"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/Card";
import { MeetingStatusBadge } from "@/components/Badge";
import { MeetingStatus } from "@/lib/types";

/**
 * 전체 회의 목록 (프로젝트 전체를 가로지르는 회의 모아보기).
 *
 * Figma에서 "회의_전체/준비중/승인완료/진행중/후속답변대기/종료"라는 이름으로 각각 다른
 * 노드가 있었지만, 실제로 열어보니 전부 **같은 "회의" 목록 화면의 상태 탭**만 다른
 * 스크린샷이었다 (별도의 상세/승인 화면이 아니었음). 그래서 화면 하나로 구현하고 탭으로
 * 상태를 필터링하는 실제 동작을 붙였다. 사이드바 "회의" 항목도 이 페이지로 연결된다.
 *
 * 디자인의 "승인완료" 탭은 이 앱의 상태 모델에 없어(승인 중이던 회의는 시작하는 순간
 * 바로 "라이브"가 됨) 뺐고, 카드의 재생하기/AI 요약 보기 버튼은 이번 스코프에서 제외된
 * 기능(회의_재생하기 창)이거나 데이터가 없는 기능이라 실제로 이동 가능한 "자세히 보기"
 * 하나로 통일했다.
 */

const TABS: { key: MeetingStatus | "전체"; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "준비중", label: "준비중" },
  { key: "승인대기", label: "승인대기" },
  { key: "라이브", label: "진행중" },
  { key: "후속답변대기", label: "후속답변대기" },
  { key: "종료", label: "종료" },
];

export default function AllMeetingsPage() {
  const { meetings, projects } = useStore();
  const [tab, setTab] = useState<MeetingStatus | "전체">("전체");

  const filtered = useMemo(
    () => (tab === "전체" ? meetings : meetings.filter((m) => m.status === tab)),
    [meetings, tab]
  );

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filtered]
  );

  const countFor = (key: MeetingStatus | "전체") =>
    key === "전체" ? meetings.length : meetings.filter((m) => m.status === key).length;

  const statusLink = (meetingId: string, projectId: string, status: MeetingStatus) => {
    if (status === "라이브") return `/projects/${projectId}/meetings/${meetingId}/live`;
    if (status === "후속답변대기" || status === "종료") return `/projects/${projectId}/meetings/${meetingId}/review`;
    return `/projects/${projectId}/meetings/${meetingId}`;
  };

  return (
    <div className="meetings-dashboard-page">
      <div className="page-header page-header-row meetings-page-header">
        <div>
          <h1>회의</h1>
          <p className="muted">모든 AI 회의 기록과 요약을 확인하세요</p>
        </div>
        <Link href="/" className="btn btn-primary meetings-create-button">
          + 새 회의 만들기
        </Link>
      </div>

      <div className="tab-list meetings-filter-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab-button ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
            <span className="meetings-filter-count">{countFor(t.key) || "–"}</span>
          </button>
        ))}
      </div>

      <div className="meetings-list">
        {sorted.length === 0 ? (
          <EmptyState title="해당 상태의 회의가 없습니다" description="다른 탭을 선택하거나 새 회의를 만들어보세요." />
        ) : (
          sorted.map((meeting) => {
            const project = projects.find((p) => p.id === meeting.projectId);
            return (
              <Link
                key={meeting.id}
                href={statusLink(meeting.id, meeting.projectId, meeting.status)}
                className="meeting-dashboard-card"
              >
                <div className="meeting-dashboard-main">
                  <div className="meeting-dashboard-title-row">
                    <strong>{meeting.title}</strong>
                    <MeetingStatusBadge status={meeting.status} />
                  </div>
                  {project && (
                    <p className="meeting-dashboard-project">
                      <span className="meeting-dashboard-project-icon">📁</span>
                      {project.name}
                      <span aria-hidden="true">›</span>
                    </p>
                  )}
                  <p className="meeting-dashboard-purpose">{meeting.purpose}</p>
                  <div className="meeting-dashboard-actions" aria-hidden="true">
                    <span className="meeting-dashboard-detail-button">자세히 보기</span>
                  </div>
                </div>
                <div className="meeting-dashboard-meta">
                  <strong>{new Date(meeting.createdAt).toLocaleDateString("ko-KR")}</strong>
                  <span>
                  {new Date(meeting.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
