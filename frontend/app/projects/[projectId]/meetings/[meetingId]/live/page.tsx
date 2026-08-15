"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState, Card } from "@/components/Card";
import { HoldStatusBadge, MeetingStatusBadge } from "@/components/Badge";
import { evaluateAlternativeMock } from "@/lib/mockAi";

export default function LiveMeetingPage({
  params,
}: {
  params: { projectId: string; meetingId: string };
}) {
  const { getProject, getMeeting, askQuestion, tickNumberConfirmation, resolveNumberConfirmation } =
    useStore();
  const project = getProject(params.projectId);
  const meeting = getMeeting(params.meetingId);

  const [question, setQuestion] = useState("");
  const [proposalTopic, setProposalTopic] = useState<string>("");
  const [proposalText, setProposalText] = useState("");
  const [proposals, setProposals] = useState<
    { id: string; topic: string; text: string; withinRange: boolean | null; note: string }[]
  >([]);

  // 기능6: 숫자확인 팝업 10초 카운트다운. 1초마다 감소시키고 0이 되면 자동 보류(미응답).
  useEffect(() => {
    if (!meeting) return;
    const pending = meeting.transcript.filter(
      (t) => t.matchResult?.numberConfirmation?.status === "대기중"
    );
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      pending.forEach((entry) => {
        const nc = entry.matchResult!.numberConfirmation!;
        if (nc.secondsLeft <= 1) {
          resolveNumberConfirmation(meeting.id, entry.id, "미응답");
        } else {
          tickNumberConfirmation(meeting.id, entry.id);
        }
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [meeting, resolveNumberConfirmation, tickNumberConfirmation]);

  if (!project || !meeting) {
    return <EmptyState title="회의를 찾을 수 없습니다" />;
  }

  const approvedPositions = meeting.positions.filter(
    (p) => p.approvalStatus === "승인" || p.approvalStatus === "수정후승인"
  );

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    askQuestion(meeting.id, question.trim());
    setQuestion("");
  };

  const handleEvaluateProposal = () => {
    const position = approvedPositions.find((p) => p.topic === proposalTopic);
    if (!position || !proposalText.trim()) return;
    const result = evaluateAlternativeMock(proposalText.trim(), position);
    setProposals((prev) => [
      { id: `${Date.now()}`, topic: position.topic, text: proposalText.trim(), ...result },
      ...prev,
    ]);
    setProposalText("");
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/">프로젝트</Link> / <Link href={`/projects/${project.id}`}>{project.name}</Link> /{" "}
        <Link href={`/projects/${project.id}/meetings/${meeting.id}`}>{meeting.title}</Link> / 라이브
      </div>

      <div className="page-header page-header-row">
        <div>
          <div className="row">
            <h1 style={{ margin: 0 }}>{meeting.title}</h1>
            <MeetingStatusBadge status={meeting.status} />
          </div>
          <p className="muted">상대방: {meeting.counterpartInfo}</p>
        </div>
        {(meeting.status === "후속답변대기" || meeting.status === "종료") && (
          <Link
            href={`/projects/${project.id}/meetings/${meeting.id}/review`}
            className="btn btn-primary"
          >
            결과 검토로 이동
          </Link>
        )}
      </div>

      <div className="two-col">
        <div>
          <section className="section">
            <h2>실시간 전사 · 통역 전달</h2>
            <Card>
              <div className="transcript-list">
                {meeting.transcript.map((entry) => (
                  <div key={entry.id} className={`transcript-entry from-${entry.speaker}`}>
                    <div className="transcript-bubble">
                      {entry.text}
                      {entry.translatedText && (
                        <div className="transcript-translated">{entry.translatedText}</div>
                      )}
                    </div>
                    <div className="transcript-meta">
                      {entry.speakerLabel} · {entry.timestamp}
                    </div>

                    {entry.matchResult && (
                      <div
                        className={`match-panel ${entry.matchResult.matched ? "matched" : "held"}`}
                        style={{ alignSelf: entry.speaker === "counterpart" ? "flex-start" : "flex-end" }}
                      >
                        {entry.matchResult.matched ? (
                          <>
                            ✅ 매칭됨 — 안건 <strong>{entry.matchResult.matchedTopic}</strong>
                            <div className="muted" style={{ marginTop: 2 }}>
                              {entry.matchResult.intentMatchReasoning}
                            </div>
                            {entry.matchResult.limitationNote && (
                              <div className="muted" style={{ marginTop: 2 }}>
                                제한사항: {entry.matchResult.limitationNote}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            ⏸ 보류됨
                            <div className="muted" style={{ marginTop: 2 }}>
                              {entry.matchResult.holdReason}
                            </div>
                          </>
                        )}

                        {entry.matchResult.numberConfirmation && (
                          <div className="number-confirm-box">
                            {entry.matchResult.numberConfirmation.status === "대기중" && (
                              <>
                                🔢 핵심 수치 포함 — 상대방 확인 대기 중 (
                                {entry.matchResult.numberConfirmation.secondsLeft}초)
                                <div className="number-confirm-actions">
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() =>
                                      resolveNumberConfirmation(meeting.id, entry.id, "확인됨")
                                    }
                                  >
                                    O 확인
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={() =>
                                      resolveNumberConfirmation(meeting.id, entry.id, "거부됨")
                                    }
                                  >
                                    X 거부
                                  </button>
                                </div>
                              </>
                            )}
                            {entry.matchResult.numberConfirmation.status === "확인됨" && "✅ 전달 확정됨"}
                            {entry.matchResult.numberConfirmation.status === "거부됨" &&
                              "❌ 거부됨 — 자동 보류 처리됨"}
                            {entry.matchResult.numberConfirmation.status === "미응답" &&
                              "⏱ 10초 미응답 — 자동 보류 처리됨 (자동 승인 아님)"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <form onSubmit={handleAsk} className="row" style={{ marginTop: 12 }}>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="상대방 질문 시뮬레이션 (실제로는 실시간 STT 결과가 여기로 들어옵니다)"
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary">
                질문 전송
              </button>
            </form>
          </section>

          <section className="section">
            <h2>승인 범위 내 대안 조율</h2>
            <Card>
              {approvedPositions.length === 0 ? (
                <p className="muted">승인된 안건이 없어 대안 조율을 평가할 수 없습니다.</p>
              ) : (
                <>
                  <div className="row">
                    <select
                      value={proposalTopic}
                      onChange={(e) => setProposalTopic(e.target.value)}
                      style={{ maxWidth: 220 }}
                    >
                      <option value="">관련 안건 선택</option>
                      {approvedPositions.map((p) => (
                        <option key={p.topic} value={p.topic}>
                          {p.topic}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={proposalText}
                      onChange={(e) => setProposalText(e.target.value)}
                      placeholder="상대방이 제안한 대안 (예: 8/27로 확정하는 건 어떨까요?)"
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn"
                      onClick={handleEvaluateProposal}
                      disabled={!proposalTopic || !proposalText.trim()}
                    >
                      평가
                    </button>
                  </div>
                  <div className="stack" style={{ marginTop: 12 }}>
                    {proposals.map((p) => (
                      <div key={p.id} className="row-between">
                        <span>
                          [{p.topic}] {p.text}
                        </span>
                        <span className={`badge badge-${p.withinRange === null ? "neutral" : p.withinRange ? "success" : "danger"}`}>
                          {p.withinRange === null ? "판단 보류" : p.withinRange ? "조율 가능" : "조율 불가"}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </section>
        </div>

        <aside>
          <section className="section">
            <h2>보류함 ({meeting.holdItems.length})</h2>
            {meeting.holdItems.length === 0 ? (
              <p className="muted">아직 보류된 항목이 없습니다.</p>
            ) : (
              meeting.holdItems.map((h) => (
                <Card key={h.id} className={`hold-item-card status-${h.status}`}>
                  <div className="row-between">
                    <strong>{h.relatedTopic ?? "(주제 미상)"}</strong>
                    <HoldStatusBadge status={h.status} />
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>
                    {h.reason}
                  </p>
                </Card>
              ))
            )}
            <p className="field-hint">
              후속 답변 작성·재오픈 관리는 미팅 종료 후 &ldquo;결과 검토&rdquo; 화면에서 진행합니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
