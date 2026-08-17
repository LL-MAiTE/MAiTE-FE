"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState, Card } from "@/components/Card";
import { HoldStatusBadge, MeetingStatusBadge, Badge } from "@/components/Badge";
import { evaluateAlternativeMock } from "@/lib/mockAi";
import { AgoraConnectionStatus, AgoraVoiceSession, RemoteParticipant } from "@/lib/agoraRtc";

const VOICE_STATUS_TONE: Record<AgoraConnectionStatus, "neutral" | "warning" | "success" | "danger"> = {
  연결안됨: "neutral",
  연결중: "warning",
  연결됨: "success",
  오류: "danger",
};

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
  const [asking, setAsking] = useState(false);
  const [proposalTopic, setProposalTopic] = useState<string>("");
  const [proposalText, setProposalText] = useState("");
  const [proposals, setProposals] = useState<
    { id: string; topic: string; text: string; withinRange: boolean | null; note: string }[]
  >([]);

  // 백엔드(MAiTE-BE)가 소유한 Agora 연동으로 전환했다 — 백엔드가 안건 기반 시스템
  // 프롬프트를 만들고 자기 소유의 Agora Conversational AI Agent를 채널에 join시킨다.
  // 그래야 이 미팅의 transcript/meeting_log/hold_item이 실제 DB에 쌓여서 보류함·사후검토
  // 화면이 진짜 데이터를 받는다 (프론트 자체 Agent 연동은 lib/agoraAgentClient.ts에 남아있지만
  // 더는 라이브 화면에서 쓰지 않음).
  const [voiceStatus, setVoiceStatus] = useState<AgoraConnectionStatus>("연결안됨");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const voiceSessionRef = useRef<AgoraVoiceSession | null>(null);

  const [backendStatus, setBackendStatus] = useState<"없음" | "동기화중" | "시작중" | "실행중" | "오류">(
    "없음"
  );
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendMeetingId, setBackendMeetingId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      voiceSessionRef.current?.disconnect();
    };
  }, []);

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

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    const text = question.trim();
    setQuestion("");
    try {
      await askQuestion(meeting.id, text);
    } finally {
      setAsking(false);
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    voiceSessionRef.current?.setMuted(next);
    setMuted(next);
  };

  const handleStartBackendMeeting = async () => {
    setBackendError(null);
    setVoiceError(null);
    setBackendStatus("동기화중");
    try {
      // 1) 로컬(localStorage) 회의 데이터를 백엔드 실 DB에 반영 (처음 한 번만 실제로 생성됨)
      const syncRes = await fetch("/api/backend/sync-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localMeetingId: meeting.id,
          projectId: project.id,
          projectName: project.name,
          title: meeting.title,
          purpose: meeting.purpose,
          counterpartInfo: meeting.counterpartInfo,
          approvedPositions: approvedPositions.map((p) => ({
            topic: p.topic,
            questionText: p.questionText,
            answer: p.answer,
            preference: p.preference,
            concessionRange: p.concessionRange,
            dealbreaker: p.dealbreaker,
            priority: p.priority,
            scheduleConstraint: p.scheduleConstraint,
          })),
        }),
      });
      const syncData = await syncRes.json();
      if (!syncRes.ok) throw new Error(syncData.error ?? `HTTP ${syncRes.status}`);
      setBackendMeetingId(syncData.backendMeetingId);

      // 2) 백엔드가 시스템 프롬프트 생성 + 자기 소유 Agora Agent를 채널에 join
      setBackendStatus("시작중");
      const startRes = await fetch("/api/backend/meeting-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backendMeetingId: syncData.backendMeetingId }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error ?? `HTTP ${startRes.status}`);

      // 3) 사람 참여자도 백엔드가 발급한 같은 채널/토큰으로 RTC join
      const session = new AgoraVoiceSession({
        onStatusChange: (status, error) => {
          setVoiceStatus(status);
          if (error) setVoiceError(error);
        },
        onRemoteParticipantsChange: setRemoteParticipants,
      });
      voiceSessionRef.current = session;
      await session.connect(startData.agoraChannel, {
        appId: startData.agoraAppId,
        token: startData.agoraToken,
      });

      setBackendStatus("실행중");
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : String(err));
      setBackendStatus("오류");
    }
  };

  const handleStopBackendMeeting = async () => {
    await voiceSessionRef.current?.disconnect();
    voiceSessionRef.current = null;
    setMuted(false);
    try {
      if (backendMeetingId) {
        const res = await fetch("/api/backend/meeting-end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backendMeetingId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : String(err));
    } finally {
      setBackendStatus("없음");
    }
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

      <Card>
        <div className="row-between">
          <div>
            <div className="row">
              <strong>실시간 음성 미팅 (백엔드 연동)</strong>
              <Badge tone={VOICE_STATUS_TONE[voiceStatus]}>{voiceStatus}</Badge>
              <Badge
                tone={
                  backendStatus === "실행중" ? "success" : backendStatus === "오류" ? "danger" : "neutral"
                }
              >
                백엔드 {backendStatus}
              </Badge>
              {remoteParticipants.length > 0 && (
                <span className="muted">참가자 {remoteParticipants.length}명 연결됨</span>
              )}
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              백엔드가 이 회의의 승인 안건으로 Agora Conversational AI Agent를 채널에 join시키고,
              그 채널·토큰으로 여기(사람 참여자)도 함께 join합니다. 마이크 권한이 필요합니다.
              대화 내용은 백엔드 DB(transcript/보류함/사후검토)에 실제로 쌓입니다.
            </p>
            {voiceError && <p style={{ color: "var(--tone-danger-fg)" }}>{voiceError}</p>}
            {backendError && <p style={{ color: "var(--tone-danger-fg)" }}>{backendError}</p>}
          </div>
          <div className="row">
            {backendStatus === "실행중" ? (
              <>
                <button className="btn btn-sm" onClick={handleToggleMute}>
                  {muted ? "음소거 해제" : "음소거"}
                </button>
                <button className="btn btn-sm btn-danger" onClick={handleStopBackendMeeting}>
                  미팅 종료
                </button>
              </>
            ) : (
              <button
                className="btn btn-sm btn-primary"
                onClick={handleStartBackendMeeting}
                disabled={backendStatus === "동기화중" || backendStatus === "시작중"}
              >
                {backendStatus === "동기화중"
                  ? "회의 동기화 중…"
                  : backendStatus === "시작중"
                    ? "AI 진행자 참여시키는 중…"
                    : "미팅 시작"}
              </button>
            )}
          </div>
        </div>
      </Card>

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
                disabled={asking}
              />
              <button type="submit" className="btn btn-primary" disabled={asking}>
                {asking ? "AI 판단 중…" : "질문 전송"}
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
