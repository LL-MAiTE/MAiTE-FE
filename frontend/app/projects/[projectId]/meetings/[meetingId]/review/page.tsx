"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState, Card } from "@/components/Card";
import { HoldStatusBadge, MeetingStatusBadge, Badge } from "@/components/Badge";
import { MAX_REOPEN_COUNT, TranscriptReviewDecision } from "@/lib/types";
import type {
  BackendHoldItem,
  BackendMeetingLog,
  BackendRequiredReview,
  BackendTranscript,
} from "@/lib/backendApi";

const DECISIONS: Exclude<TranscriptReviewDecision, "미검토">[] = ["승인", "수정", "철회", "재보류"];

/** action(한국어 결정) ↔ 백엔드 ReviewActionType. 순서/개수가 그대로 대응된다. */
const DECISION_TO_ACTION: Record<Exclude<TranscriptReviewDecision, "미검토">, "APPROVED" | "REVISED" | "WITHDRAWN" | "RE_HELD"> = {
  승인: "APPROVED",
  수정: "REVISED",
  철회: "WITHDRAWN",
  재보류: "RE_HELD",
};

/** 백엔드 HoldItemStatus → 프론트가 이미 쓰던 한국어 라벨(HoldStatusBadge 톤 재사용). */
function holdStatusLabel(status: BackendHoldItem["status"]): string {
  switch (status) {
    case "UNRESOLVED":
    case "REOPENED":
      return "보류";
    case "AWAITING_ANSWER":
      return "후속답변대기";
    case "CONFIRMED_IMMEDIATE":
    case "CONFIRMED_TIMEOUT":
      return "확정";
    case "NEEDS_REALTIME":
      return "실시간조율필요";
  }
}

/**
 * 실시간 통화 중 저장되는 transcript는 항상 "USER(상대방 발화) → AI_AGENT(AI 응답)"
 * 순서쌍으로 쌓인다(MeetingService.recordLiveTurn 참고). meeting_log는 AI_AGENT 쪽
 * transcript에 연결되어 있어서 원문 질문이 없는데, spokenAt 순서상 바로 앞의 USER
 * 발화가 그 질문이라 그걸로 짝지어준다.
 */
function buildQuestionByAiTranscriptId(transcripts: BackendTranscript[]): Map<string, string> {
  const sorted = [...transcripts].sort((a, b) => a.spokenAt.localeCompare(b.spokenAt));
  const map = new Map<string, string>();
  let lastUserText: string | null = null;
  for (const t of sorted) {
    if (t.speakerLabel === "USER") {
      lastUserText = t.text;
    } else if (t.speakerLabel === "AI_AGENT" && lastUserText) {
      map.set(t.id, lastUserText);
      lastUserText = null;
    }
  }
  return map;
}

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

  // 백엔드 연동 — 라이브를 한 번이라도 시작한 미팅만 backendMeetingId가 있다.
  const [backendMeetingId, setBackendMeetingId] = useState<string | null | undefined>(undefined);
  const [holdItems, setHoldItems] = useState<BackendHoldItem[]>([]);
  const [meetingLogs, setMeetingLogs] = useState<BackendMeetingLog[]>([]);
  const [transcripts, setTranscripts] = useState<BackendTranscript[]>([]);
  const [requiredReviews, setRequiredReviews] = useState<BackendRequiredReview[]>([]);
  const [loadingBackend, setLoadingBackend] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const refetchBackendData = async (bMeetingId: string) => {
    setBackendError(null);
    try {
      const [holdRes, logsRes, transcriptsRes, requiredRes] = await Promise.all([
        fetch(`/api/backend/hold-items?backendMeetingId=${bMeetingId}`),
        fetch(`/api/backend/meeting-logs?backendMeetingId=${bMeetingId}`),
        fetch(`/api/backend/meeting-transcripts?backendMeetingId=${bMeetingId}`),
        fetch(`/api/backend/required-reviews?backendMeetingId=${bMeetingId}`),
      ]);
      const [holdData, logsData, transcriptsData, requiredData] = await Promise.all([
        holdRes.json(),
        logsRes.json(),
        transcriptsRes.json(),
        requiredRes.json(),
      ]);
      if (!holdRes.ok) throw new Error(holdData.error ?? "보류함을 불러오지 못했습니다.");
      if (!logsRes.ok) throw new Error(logsData.error ?? "대화 로그를 불러오지 못했습니다.");
      if (!transcriptsRes.ok) throw new Error(transcriptsData.error ?? "전사 원문을 불러오지 못했습니다.");
      if (!requiredRes.ok) throw new Error(requiredData.error ?? "필수 검토 항목을 불러오지 못했습니다.");
      setHoldItems(holdData.holdItems);
      setMeetingLogs(logsData.logs);
      setTranscripts(transcriptsData.transcripts);
      setRequiredReviews(requiredData.requiredReviews);
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!meeting) return;
    let cancelled = false;
    setLoadingBackend(true);
    fetch(`/api/backend/meeting-link?localMeetingId=${meeting.id}`)
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        setBackendMeetingId(data.backendMeetingId ?? null);
        if (data.backendMeetingId) {
          await refetchBackendData(data.backendMeetingId);
        }
      })
      .catch(() => {
        if (!cancelled) setBackendMeetingId(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBackend(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.id]);

  const questionByAiTranscriptId = useMemo(() => buildQuestionByAiTranscriptId(transcripts), [transcripts]);

  if (!project || !meeting) {
    return <EmptyState title="회의를 찾을 수 없습니다" />;
  }

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setPendingAction(key);
    setBackendError(null);
    try {
      await fn();
      if (backendMeetingId) await refetchBackendData(backendMeetingId);
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingAction(null);
    }
  };

  const applyBackendReviewAction = (
    logId: string,
    decision: Exclude<TranscriptReviewDecision, "미검토">,
    note?: string
  ) =>
    runAction(`review-${logId}`, async () => {
      const res = await fetch(`/api/backend/meeting-logs/${logId}/review-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: DECISION_TO_ACTION[decision], note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    });

  const submitBackendAnswer = (holdItemId: string) =>
    runAction(`answer-${holdItemId}`, async () => {
      const res = await fetch(`/api/backend/hold-items/${holdItemId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerText: followupDrafts[holdItemId].trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFollowupDrafts((prev) => ({ ...prev, [holdItemId]: "" }));
    });

  const reopenBackendHold = (holdItemId: string) =>
    runAction(`reopen-${holdItemId}`, async () => {
      const res = await fetch(`/api/backend/hold-items/${holdItemId}/reopen`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReopenDrafts((prev) => ({ ...prev, [holdItemId]: "" }));
    });

  const confirmBackendHold = (holdItemId: string) =>
    runAction(`confirm-${holdItemId}`, async () => {
      const res = await fetch(`/api/backend/hold-items/${holdItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED_TIMEOUT" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    });

  const confirmBackendRequiredReview = (id: string) =>
    runAction(`required-${id}`, async () => {
      const res = await fetch(`/api/backend/required-reviews/${id}`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    });

  // ── 로컬(mock) 전용 핸들러 — backendMeetingId가 없는(아직 라이브를 시작한 적 없는) 미팅용 ──
  const applyLocalDecision = (transcriptEntryId: string, decision: TranscriptReviewDecision) => {
    const note =
      decision === "재보류"
        ? reviewDecisions[transcriptEntryId]?.note ||
          "사후검토 결과 승인 범위를 벗어난 매칭으로 판단됨"
        : "";
    setReviewDecisions((prev) => ({ ...prev, [transcriptEntryId]: { decision, note } }));
    setTranscriptReviewDecision(meeting.id, transcriptEntryId, decision, note);
  };

  const counterpartEntries = meeting.transcript.filter((t) => t.speaker === "counterpart");
  const usingBackend = !!backendMeetingId;

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
        {loadingBackend && <p className="field-hint">실제 회의 데이터를 확인하는 중…</p>}
        {!loadingBackend && !usingBackend && backendMeetingId === null && (
          <p className="field-hint">
            이 미팅은 아직 라이브로 시작된 적이 없어 시뮬레이션(로컬) 데이터로 표시합니다. 라이브 회의를 시작하면
            실제 대화 기록으로 전환됩니다.
          </p>
        )}
        {backendError && <p style={{ color: "var(--tone-danger-fg)" }}>{backendError}</p>}
      </div>

      {usingBackend ? (
        <>
          <section className="section">
            <h2>대화별 검토 ({meetingLogs.length}건)</h2>
            {meetingLogs.length === 0 ? (
              <p className="muted">아직 저장된 대화가 없습니다.</p>
            ) : (
              meetingLogs.map((log) => {
                const current = reviewDecisions[log.id]?.decision;
                const question = questionByAiTranscriptId.get(log.transcriptId);
                return (
                  <Card key={log.id}>
                    {question && (
                      <p>
                        <strong>상대방</strong>: {question}
                      </p>
                    )}
                    <p className="muted">
                      AI 판단: {log.status === "DELIVERED" ? "매칭" : "보류"} — {log.translatedText ?? "(응답 없음)"}
                    </p>
                    <div className="row">
                      {DECISIONS.map((d) => (
                        <button
                          key={d}
                          className={`btn btn-sm ${current === d ? "btn-primary" : ""}`}
                          disabled={pendingAction === `review-${log.id}`}
                          onClick={() => {
                            setReviewDecisions((prev) => ({ ...prev, [log.id]: { decision: d, note: "" } }));
                            applyBackendReviewAction(log.id, d);
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    {current === "재보류" && (
                      <p className="field-hint">재보류로 전환되어 아래 &ldquo;보류함&rdquo;에 새 항목으로 추가되었습니다.</p>
                    )}
                  </Card>
                );
              })
            )}
          </section>

          <section className="section">
            <h2>보류함 ({holdItems.length})</h2>
            {holdItems.length === 0 ? (
              <EmptyState title="보류된 항목이 없습니다" />
            ) : (
              holdItems.map((h) => {
                const label = holdStatusLabel(h.status);
                const needsAnswer = h.status === "UNRESOLVED" || h.status === "REOPENED";
                return (
                  <Card key={h.id} className={`hold-item-card status-${label}`}>
                    <div className="row-between">
                      <div className="muted">{h.reason ?? "(사유 미상)"}</div>
                      <HoldStatusBadge status={label} />
                    </div>
                    <p className="field-hint">
                      재오픈 {h.reopenCount} / {MAX_REOPEN_COUNT}회
                    </p>

                    {needsAnswer && (
                      <div className="field" style={{ marginTop: 8 }}>
                        <label>후속 답변 작성</label>
                        <textarea
                          value={followupDrafts[h.id] ?? ""}
                          onChange={(e) => setFollowupDrafts((prev) => ({ ...prev, [h.id]: e.target.value }))}
                          placeholder="상대방에게 비동기로 전달할 답변을 작성하세요"
                          rows={2}
                        />
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ marginTop: 6 }}
                          disabled={!followupDrafts[h.id]?.trim() || pendingAction === `answer-${h.id}`}
                          onClick={() => submitBackendAnswer(h.id)}
                        >
                          답변 전달 (비동기)
                        </button>
                      </div>
                    )}

                    {h.status === "AWAITING_ANSWER" && (
                      <div style={{ marginTop: 8 }}>
                        <p>
                          <strong>전달된 답변:</strong> {h.answerText}
                        </p>
                        <p className="muted">
                          24시간 내 상대방 재오픈이 없으면 자동 확정됩니다.
                          {h.deliveredToCounterpartAt &&
                            ` (전달: ${new Date(h.deliveredToCounterpartAt).toLocaleString("ko-KR")})`}
                        </p>
                        <div className="row">
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={pendingAction === `confirm-${h.id}`}
                            onClick={() => confirmBackendHold(h.id)}
                          >
                            확정 처리 (타임아웃 시뮬레이션)
                          </button>
                        </div>
                        <div className="field" style={{ marginTop: 8 }}>
                          <label>상대방 재오픈 (시뮬레이션)</label>
                          <button
                            className="btn btn-sm"
                            style={{ marginTop: 6 }}
                            disabled={pendingAction === `reopen-${h.id}` || h.reopenCount >= MAX_REOPEN_COUNT}
                            onClick={() => reopenBackendHold(h.id)}
                          >
                            재오픈
                          </button>
                        </div>
                      </div>
                    )}

                    {label === "확정" && h.answerText && (
                      <p style={{ marginTop: 8 }}>
                        <strong>최종 전달된 답변:</strong> {h.answerText}
                      </p>
                    )}

                    {h.status === "NEEDS_REALTIME" && (
                      <p className="muted" style={{ marginTop: 8 }}>
                        재오픈 상한({MAX_REOPEN_COUNT}회)에 도달했습니다. &ldquo;이 사안은 비동기로는 해결이
                        어렵습니다. 실시간 미팅을 다시 잡아주세요&rdquo;로 양측에 안내되고 종결되었습니다.
                      </p>
                    )}
                  </Card>
                );
              })
            )}
          </section>

          <section className="section">
            <h2>필수 검토 항목 ({requiredReviews.length})</h2>
            {requiredReviews.length === 0 ? (
              <EmptyState title="상대방이 지정한 필수 검토 항목이 없습니다" />
            ) : (
              requiredReviews.map((item) => {
                const relatedLog = meetingLogs.find((l) => l.id === item.meetingLogId);
                return (
                  <Card key={item.id}>
                    <div className="row-between">
                      <strong>{relatedLog?.translatedText ?? "(관련 대화 미상)"}</strong>
                      <Badge tone={item.status === "CONFIRMED" ? "success" : "warning"}>
                        {item.status === "CONFIRMED" ? "확인 후 확정" : "확인 전 (조건부 합의)"}
                      </Badge>
                    </div>
                    {item.status === "CONDITIONAL" && (
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ marginTop: 8 }}
                        disabled={pendingAction === `required-${item.id}`}
                        onClick={() => confirmBackendRequiredReview(item.id)}
                      >
                        확인 완료 → 확정으로 전환
                      </button>
                    )}
                  </Card>
                );
              })
            )}
          </section>
        </>
      ) : (
        <>
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
                          onClick={() => applyLocalDecision(entry.id, d)}
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
        </>
      )}
    </div>
  );
}
