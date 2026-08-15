"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState, Card } from "@/components/Card";
import { HoldStatusBadge, MeetingStatusBadge, Badge } from "@/components/Badge";
import { MAX_REOPEN_COUNT, TranscriptReviewDecision } from "@/lib/types";

const DECISIONS: TranscriptReviewDecision[] = ["승인", "수정", "철회", "재보류"];

export default function MeetingReviewPage({
  params,
}: {
  params: { projectId: string; meetingId: string };
}) {
  const {
    getProject,
    getMeeting,
    setTranscriptReviewDecision,
    submitHoldFollowup,
    reopenHoldItem,
    confirmHoldItem,
    confirmMandatoryReviewItem,
  } = useStore();

  const project = getProject(params.projectId);
  const meeting = getMeeting(params.meetingId);

  const [reviewDecisions, setReviewDecisions] = useState<
    Record<string, { decision: TranscriptReviewDecision; note: string }>
  >({});
  const [followupDrafts, setFollowupDrafts] = useState<Record<string, string>>({});
  const [reopenDrafts, setReopenDrafts] = useState<Record<string, string>>({});
  const [mandatoryDrafts, setMandatoryDrafts] = useState<Record<string, string>>({});

  if (!project || !meeting) {
    return <EmptyState title="회의를 찾을 수 없습니다" />;
  }

  const counterpartEntries = meeting.transcript.filter((t) => t.speaker === "counterpart");

  const applyDecision = (transcriptEntryId: string, decision: TranscriptReviewDecision) => {
    const note =
      decision === "재보류"
        ? reviewDecisions[transcriptEntryId]?.note ||
          "사후검토 결과 승인 범위를 벗어난 매칭으로 판단됨"
        : "";
    setReviewDecisions((prev) => ({ ...prev, [transcriptEntryId]: { decision, note } }));
    setTranscriptReviewDecision(meeting.id, transcriptEntryId, decision, note);
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/">프로젝트</Link> / <Link href={`/projects/${project.id}`}>{project.name}</Link> /{" "}
        <Link href={`/projects/${project.id}/meetings/${meeting.id}`}>{meeting.title}</Link> / 결과 검토
      </div>

      <div className="page-header">
        <div className="row">
          <h1 style={{ margin: 0 }}>{meeting.title} — 결과 검토</h1>
          <MeetingStatusBadge status={meeting.status} />
        </div>
        <p className="muted">
          모든 보류 항목이 확정되거나 &ldquo;실시간 조율 필요&rdquo;로 종결되면 미팅 상태가 자동으로
          &ldquo;종료&rdquo;로 바뀝니다. 별도의 종료 버튼은 없습니다.
        </p>
      </div>

      <section className="section">
        <h2>대화별 검토 ({counterpartEntries.length}건)</h2>
        {counterpartEntries.length === 0 ? (
          <p className="muted">상대방 발화가 없습니다.</p>
        ) : (
          counterpartEntries.map((entry) => {
            const current = reviewDecisions[entry.id]?.decision;
            return (
              <Card key={entry.id}>
                <p>
                  <strong>{entry.speakerLabel}</strong>: {entry.text}
                </p>
                {entry.matchResult && (
                  <p className="muted">
                    AI 판단: {entry.matchResult.matched ? `매칭 (${entry.matchResult.matchedTopic})` : "보류"} —{" "}
                    {entry.matchResult.responseText ?? entry.matchResult.holdReason}
                  </p>
                )}
                <div className="row">
                  {DECISIONS.map((d) => (
                    <button
                      key={d}
                      className={`btn btn-sm ${current === d ? "btn-primary" : ""}`}
                      onClick={() => applyDecision(entry.id, d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {current === "재보류" && (
                  <p className="field-hint">
                    재보류로 전환되어 아래 &ldquo;보류함&rdquo;에 새 항목으로 추가되었습니다 (재오픈 횟수에 포함).
                  </p>
                )}
              </Card>
            );
          })
        )}
      </section>

      <section className="section">
        <h2>보류함 ({meeting.holdItems.length})</h2>
        {meeting.holdItems.length === 0 ? (
          <EmptyState title="보류된 항목이 없습니다" />
        ) : (
          meeting.holdItems.map((h) => (
            <Card key={h.id} className={`hold-item-card status-${h.status}`}>
              <div className="row-between">
                <div>
                  <strong>{h.relatedTopic ?? "(주제 미상)"}</strong>{" "}
                  <span className="muted">· {h.reasonType}</span>
                </div>
                <HoldStatusBadge status={h.status} />
              </div>
              <p className="muted" style={{ marginTop: 4 }}>
                {h.reason}
              </p>
              <p className="field-hint">재오픈 {h.reopenCount} / {MAX_REOPEN_COUNT}회</p>

              {h.status === "보류" && (
                <div className="field" style={{ marginTop: 8 }}>
                  <label>후속 답변 작성</label>
                  <textarea
                    value={followupDrafts[h.id] ?? ""}
                    onChange={(e) =>
                      setFollowupDrafts((prev) => ({ ...prev, [h.id]: e.target.value }))
                    }
                    placeholder="상대방에게 비동기로 전달할 답변을 작성하세요"
                    rows={2}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ marginTop: 6 }}
                    disabled={!followupDrafts[h.id]?.trim()}
                    onClick={() => {
                      submitHoldFollowup(meeting.id, h.id, followupDrafts[h.id].trim());
                      setFollowupDrafts((prev) => ({ ...prev, [h.id]: "" }));
                    }}
                  >
                    답변 전달 (비동기)
                  </button>
                </div>
              )}

              {h.status === "후속답변대기" && (
                <div style={{ marginTop: 8 }}>
                  <p>
                    <strong>전달된 답변:</strong> {h.followupAnswer}
                  </p>
                  <p className="muted">
                    24~48시간 내 상대방 재오픈이 없으면 자동 확정됩니다. (마감:{" "}
                    {h.followupDeadline && new Date(h.followupDeadline).toLocaleString("ko-KR")})
                  </p>
                  <div className="row">
                    <button className="btn btn-sm btn-primary" onClick={() => confirmHoldItem(meeting.id, h.id)}>
                      확정 처리 (만족/타임아웃 시뮬레이션)
                    </button>
                  </div>
                  <div className="field" style={{ marginTop: 8 }}>
                    <label>상대방 재오픈 사유 (시뮬레이션)</label>
                    <input
                      type="text"
                      value={reopenDrafts[h.id] ?? ""}
                      onChange={(e) => setReopenDrafts((prev) => ({ ...prev, [h.id]: e.target.value }))}
                      placeholder="예: 조금 더 구체적인 일정이 필요합니다"
                    />
                    <button
                      className="btn btn-sm"
                      style={{ marginTop: 6 }}
                      disabled={!reopenDrafts[h.id]?.trim()}
                      onClick={() => {
                        reopenHoldItem(meeting.id, h.id, reopenDrafts[h.id].trim());
                        setReopenDrafts((prev) => ({ ...prev, [h.id]: "" }));
                      }}
                    >
                      재오픈
                    </button>
                  </div>
                </div>
              )}

              {h.status === "확정" && h.followupAnswer && (
                <p style={{ marginTop: 8 }}>
                  <strong>최종 전달된 답변:</strong> {h.followupAnswer}
                </p>
              )}

              {h.status === "실시간조율필요" && (
                <p className="muted" style={{ marginTop: 8 }}>
                  재오픈 상한({MAX_REOPEN_COUNT}회)에 도달했습니다. &ldquo;이 사안은 비동기로는 해결이
                  어렵습니다. 실시간 미팅을 다시 잡아주세요&rdquo;로 양측에 안내되고 종결되었습니다.
                </p>
              )}

              {h.reopenHistory.length > 0 && (
                <ul className="reopen-history">
                  {h.reopenHistory.map((r, i) => (
                    <li key={i}>
                      {new Date(r.at).toLocaleString("ko-KR")} — {r.note}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))
        )}
      </section>

      <section className="section">
        <h2>필수 검토 항목 ({meeting.mandatoryReviewItems.length})</h2>
        {meeting.mandatoryReviewItems.length === 0 ? (
          <EmptyState title="상대방이 지정한 필수 검토 항목이 없습니다" />
        ) : (
          meeting.mandatoryReviewItems.map((item) => (
            <Card key={item.id}>
              <div className="row-between">
                <strong>{item.label}</strong>
                <Badge tone={item.status === "확인후확정" ? "success" : "warning"}>
                  {item.status === "확인후확정" ? "확인 후 확정" : "확인 전 (조건부 합의)"}
                </Badge>
              </div>
              {item.confirmationNote && <p className="muted">{item.confirmationNote}</p>}
              {item.status === "확인전" && (
                <div className="field" style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    value={mandatoryDrafts[item.id] ?? ""}
                    onChange={(e) =>
                      setMandatoryDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    placeholder="확인 결과를 입력하세요"
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ marginTop: 6 }}
                    disabled={!mandatoryDrafts[item.id]?.trim()}
                    onClick={() => {
                      confirmMandatoryReviewItem(meeting.id, item.id, mandatoryDrafts[item.id].trim());
                      setMandatoryDrafts((prev) => ({ ...prev, [item.id]: "" }));
                    }}
                  >
                    확인 완료 → 확정으로 전환
                  </button>
                </div>
              )}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
