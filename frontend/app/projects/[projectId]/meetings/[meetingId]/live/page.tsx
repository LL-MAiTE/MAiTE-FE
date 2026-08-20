"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { EmptyState, Card } from "@/components/Card";
import { HoldStatusBadge, MeetingStatusBadge } from "@/components/Badge";
import { evaluateAlternativeMock } from "@/lib/mockAi";
import { AgoraConnectionStatus, AgoraVoiceSession, RemoteParticipant, TranscriptChunk } from "@/lib/agoraRtc";
import type { MatchResult, Speaker, TranscriptEntry } from "@/lib/types";

const VOICE_STATUS_DOT: Record<AgoraConnectionStatus, "neutral" | "warn" | "success" | "danger"> = {
  연결안됨: "neutral",
  연결중: "warn",
  연결됨: "success",
  오류: "danger",
};

/**
 * 라이브 미팅 화면. Figma "회의진행중"(섹션 22:19995 → 메인 프레임 22:3 → Body 22:1512 →
 * LiveMeeting 22:1515) 노드를 기반으로 만들었다. 앱 전체는 라이트 톤 MAiTE 디자인
 * 시스템을 쓰지만, 이 화면(통화 UI)만은 Figma 원본처럼 의도적으로 다크 톤 크롬을
 * 그대로 재현했다 — 화상/음성 회의 화면이 앱 전체 톤과 다르게 어두운 것은 흔한 패턴이고,
 * 원본 디자인도 그렇게 되어 있다. 실제 배치에 쓴 하위 노드:
 *  - 상단 바(22:1516): 나가기 버튼, LIVE 배지, 제목/부제, 경과 시간 타이머, 안건·보류
 *    카운트 배지
 *  - 참가자 타일 2개(22:1644 상대방, 22:1692 AI)
 *  - 실시간 대화 패널(22:1882~22:1894, 메시지 행 패턴은 22:1895/22:1906 등에서 반복 확인)
 *  - 하단 컨트롤 바(22:2046): 음소거/카메라 끄기/링크/종료 버튼 + 우측 상태 배지
 *
 * 기존 기능은 전부 그대로 유지했다 (백엔드 동기화·시작·종료, Agora 음성 연결, 음소거,
 * 10초 숫자확인 카운트다운/자동보류, 전사 매칭 결과, 승인 범위 내 대안 조율 평가,
 * 보류함) — 이번 작업은 재스킨/리플로우이지 로직 재작성이 아니다.
 *
 * Figma 원본과 다르게 처리했거나 생략한 부분:
 *  - 상단 "나가기" 버튼 뒤에 있던 확인 팝업(회의 나가기, 22:9999 — "AI가 계속 대리
 *    진행합니다" 안내)은 구현하지 않고, 회의 상세 화면으로 바로 이동하는 링크로
 *    단순화했다.
 *  - "최소화" 버튼과 "AI 대리진행 화면 최소화"(22:12498) 상태는 이 앱에 대응하는
 *    최소화 기능이 없어 생략했다.
 *  - 하단 컨트롤바의 "끄기"(카메라)와 "링크"(초대 링크) 버튼은 이 앱이 음성 전용이고
 *    초대 링크 기능도 없어 생략했다. "음소거"/"종료"만 기존 handleToggleMute /
 *    handleStopBackendMeeting에 그대로 연결했다.
 *  - 참가자 타일의 파형(waveform)은 실제 오디오 레벨 데이터가 없어 장식용 CSS
 *    바 그래프다 (연결 여부에 따라 활성/유휴로만 표시하고, 실제 진폭을 반영하지 않음).
 *  - 상단 타이머는 Figma에서 "00:06" 형태로 계속 올라가는데, 백엔드가 실제 회의
 *    시작 시각을 내려주지 않아서 프론트에서 "백엔드 실행중" 상태가 된 시점부터
 *    센 경과 시간으로 근사했다.
 *  - Figma의 실시간 대화 패널은 상대방/AI 발화를 좌우로 나누지 않고 아바타·색상
 *    으로만 구분한 세로 피드였다 — 기존 코드의 좌/우 말풍선 정렬 대신 이 방식을
 *    그대로 따랐다.
 *  - 메시지별 상태 태그(🔢 숫자 확인 / ✅ 확인됨 / ❌ 거부됨 / ⏱ 미응답 / ⏸ 보류 /
 *    ⚠ 제한 전달)는 Figma 실시간 대화 패널에 있던 배지 패턴을 그대로 옮기되, 그
 *    아래엔 실제 사유·근거·10초 O/X 확인 버튼 등 기존 로직을 전부 유지했다.
 *  - "승인 범위 내 대안 조율"과 "보류함"은 Figma "회의진행중" 화면 자체에는 대응
 *    UI가 없어서, 다크 콜 프레임 아래에 기존 라이트 톤 카드 그대로 이어붙였다.
 *
 * LiveAvatar(HeyGen) 연동: 백엔드가 Agora join 요청에 avatar 블록을 넣어두면(설정
 * 안 하면 기존처럼 음성 전용), 아바타가 별도 RTC 참가자(uid 9998)로 join해서 비디오를
 * 퍼블리시한다. 프론트는 그냥 agoraRtc.ts가 넘겨주는 비디오 트랙이 있으면 AI 타일의
 * ✨ 원형 아이콘 대신 그 영상을 꽉 채워 보여주고, 없으면(아바타 미설정 시) 기존 그대로
 * 아이콘+파형만 보인다 — 프론트 쪽은 아바타 유무를 신경 안 써도 되게 만들었다.
 */
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

  // Agora RTC data stream(stream-message)으로 직접 오는 실시간 전사(양쪽 발화 원문).
  // 백엔드 웹훅/폴링 없이 RTC 채널 join만으로 받는다 — 채널에 join한 그 누구나(사람이든
  // 이 세션이든) 받을 수 있는 브로드캐스트라, 폴링보다 훨씬 빠르고 별도 백엔드 설정도
  // 필요 없다. 백엔드 미팅이 붙어있는 동안은 이게 진짜 대화이므로, 로컬 mock 텍스트
  // 시뮬레이션(meeting.transcript, 아래 "질문하기" 폼)보다 우선해서 보여준다.
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  // 현재 "말하는 중"(아직 final 아님)인 발화가 있으면 그 항목을 계속 갱신하고, final이
  // 되거나 화자가 바뀌면 새 항목을 시작한다.
  const inProgressRef = useRef<{ speaker: TranscriptChunk["speaker"]; id: string } | null>(null);
  // Agora가 같은 확정 발화(특히 AI 쪽)를 stream-message로 두 번 이상 중복 전송하는 게
  // 실사용 중 확인됨 — 매번 새 줄로 쌓으면 같은 문장이 계속 도배된다. 방금 확정한
  // (화자, 텍스트) 조합을 기억해뒀다가 완전히 같은 확정 발화가 또 오면 무시한다.
  const lastFinalizedRef = useRef<{ speaker: TranscriptChunk["speaker"]; text: string } | null>(null);

  const handleTranscriptChunk = (chunk: TranscriptChunk) => {
    if (
      chunk.isFinal &&
      lastFinalizedRef.current?.speaker === chunk.speaker &&
      lastFinalizedRef.current?.text === chunk.text
    ) {
      return;
    }
    setLiveTranscript((prev) => {
      const inProgress = inProgressRef.current;
      if (inProgress && inProgress.speaker === chunk.speaker) {
        const updated = prev.map((e) => (e.id === inProgress.id ? { ...e, text: chunk.text } : e));
        if (chunk.isFinal) {
          inProgressRef.current = null;
          lastFinalizedRef.current = { speaker: chunk.speaker, text: chunk.text };
        }
        return updated;
      }
      const id = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry: TranscriptEntry = {
        id,
        speaker: chunk.speaker === "AI_AGENT" ? "ai" : "counterpart",
        speakerLabel: chunk.speaker === "AI_AGENT" ? "AI 협상 대리인" : counterpartLabel,
        timestamp: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
        text: chunk.text,
        translatedText: null,
      };
      if (chunk.isFinal) {
        inProgressRef.current = null;
        lastFinalizedRef.current = { speaker: chunk.speaker, text: chunk.text };
      } else {
        inProgressRef.current = { speaker: chunk.speaker, id };
      }
      return [...prev, entry];
    });
  };

  // 상단 통화 타이머(장식용) — 백엔드 회의가 "실행중"이 된 시점부터 초 단위로 센다.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // AI 참가자 타일 안에 아바타(LiveAvatar) 비디오를 붙일 DOM. 백엔드에 LiveAvatar
  // 설정이 안 돼있으면 비디오 트랙 자체가 안 와서, 기존처럼 ✨ 아이콘만 보인다.
  const aiVideoRef = useRef<HTMLDivElement | null>(null);
  // 전체화면 — 통화창(.live-call-shell)만 전체화면으로 키운다(페이지 전체가 아니라).
  const callShellRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === callShellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      callShellRef.current?.requestFullscreen?.().catch(() => {
        // 브라우저가 거부해도(권한/미지원) 조용히 무시 — 통화 자체엔 영향 없음
      });
    }
  };
  const avatarParticipant = remoteParticipants.find((p) => p.hasVideo && p.videoTrack);

  useEffect(() => {
    if (!avatarParticipant?.videoTrack || !aiVideoRef.current) return;
    avatarParticipant.videoTrack.play(aiVideoRef.current);
    return () => {
      try {
        avatarParticipant.videoTrack.stop();
      } catch {
        // ignore
      }
    };
  }, [avatarParticipant?.videoTrack]);

  useEffect(() => {
    return () => {
      voiceSessionRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (backendStatus !== "실행중") {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [backendStatus]);

  // ⚠️ 예전엔 여기서 백엔드 /meetings/:id/transcripts를 3초 간격으로 폴링했는데,
  // 그 데이터의 원천이던 Agora message_subscriber 웹훅이 실제로는 동작하지 않는
  // 필드였다는 게 밝혀졌다(Agora가 그 URL을 호출한 적이 없음 — 로그로 확인).
  // 대신 handleTranscriptChunk(위)가 RTC data stream(stream-message)에서 직접,
  // 훨씬 빠르게(청크 단위, 폴링 지연 없음) 실시간 전사를 받는다 — AgoraVoiceSession
  // 생성 시 onTranscriptChunk 핸들러로 연결(아래 handleStartBackendMeeting 참고).
  // 백엔드의 GET /meetings/:id/transcripts 자체는 살려뒀다 — 미팅 종료 후 보류함/
  // 사후검토 화면이 저장된 원문을 다시 읽어올 때는 여전히 유효하다.

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

  const counterpartLabel =
    meeting.transcript.find((t) => t.speaker === "counterpart")?.speakerLabel ?? "상대방";
  // 백엔드 미팅이 붙어있으면 그게 진짜 통화니까 폴링해온 실시간 대화를 보여주고,
  // 아니면(백엔드 연결 전/데모) 기존처럼 로컬 mock 텍스트 시뮬레이션을 보여준다.
  const displayTranscript = backendMeetingId ? liveTranscript : meeting.transcript;
  const counterpartInitial = counterpartLabel.trim().slice(0, 1) || "상";
  const aiTileActive = backendStatus === "실행중";
  const counterpartTileActive = voiceStatus === "연결됨" && remoteParticipants.length > 0;

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
      // 1) 회의 준비 단계에서 이미 만들어진 백엔드 Agenda(=meeting.id)에 실제 Meeting을 붙인다
      // (처음 한 번만 실제로 생성되고, 이후엔 저장된 매핑을 재사용한다).
      const syncRes = await fetch("/api/backend/sync-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localMeetingId: meeting.id }),
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
      setLiveTranscript([]);
      inProgressRef.current = null;
      const session = new AgoraVoiceSession({
        onStatusChange: (status, error) => {
          setVoiceStatus(status);
          if (error) setVoiceError(error);
        },
        onRemoteParticipantsChange: setRemoteParticipants,
        onTranscriptChunk: handleTranscriptChunk,
      });
      voiceSessionRef.current = session;
      await session.connect(startData.agoraChannel, {
        appId: startData.agoraAppId,
        token: startData.agoraToken,
        uid: startData.agoraUid,
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

      <div className="live-call-shell" ref={callShellRef}>
        <div className="live-call-header">
          <div className="live-call-header-left">
            <Link href={`/projects/${project.id}/meetings/${meeting.id}`} className="live-call-exit-btn">
              <img src="/icons/icon-arrow-left.svg" alt="" width={11} height={11} />
              나가기
            </Link>
            <span className="live-badge-live">
              <span className="live-badge-live-dot" />
              LIVE
            </span>
            <div>
              <p className="live-call-title">{meeting.title}</p>
              <p className="live-call-subtitle">
                {meeting.purpose} · {counterpartLabel} (상대방)
              </p>
            </div>
          </div>

          <div className="live-call-timer">
            <span className="live-call-timer-dot" />
            {formatElapsed(elapsedSeconds)}
          </div>

          <div className="live-call-header-right">
            {meeting.holdItems.length > 0 && (
              <span className="live-header-pill hold">
                <img src="/icons/icon-shield-check.svg" alt="" width={10} height={10} />
                보류 {meeting.holdItems.length}건
              </span>
            )}
            <span className="live-header-pill">
              <img src="/icons/icon-sparkle.svg" alt="" width={12} height={12} />
              안건 {approvedPositions.length}개 승인됨
            </span>
          </div>
        </div>

        <div className="live-call-body">
          <div className="live-video-col">
            <div className="live-participant-tile counterpart">
              <div className="live-participant-avatar counterpart">{counterpartInitial}</div>
              <div>
                <p className="live-participant-name">{counterpartLabel}</p>
                <p className="live-participant-meta">상대방 · {meeting.counterpartInfo}</p>
              </div>
              <LiveWaveform active={counterpartTileActive} tone="blue" />
            </div>

            <div className={`live-participant-tile ai ${avatarParticipant ? "has-video" : ""}`}>
              {avatarParticipant ? (
                <div ref={aiVideoRef} className="live-avatar-video" />
              ) : (
                <div className="live-participant-avatar ai">
                  ✨
                  <span className={`live-participant-status-dot ${aiTileActive ? "on" : ""}`}>
                    <span />
                  </span>
                </div>
              )}
              <div>
                <p className="live-participant-name">AI</p>
                <p className="live-participant-meta">MAiTE 대리 진행</p>
              </div>
              {!avatarParticipant && <LiveWaveform active={aiTileActive} tone="purple" />}
              <span className="live-participant-tag">
                <img src="/icons/icon-shield-check.svg" alt="" width={9} height={9} />
                {aiTileActive ? "사전 승인 범위 내 대리 진행 중" : "회의 시작 대기 중"}
              </span>
            </div>
          </div>

          <div className="live-transcript-panel">
            <div className="live-transcript-panel-header">
              <img src="/icons/icon-speaker-wave.svg" alt="" width={12} height={12} />
              <strong>실시간 대화</strong>
              <span className="live-online-dot" />
            </div>
            <div className="live-transcript-scroll">
              {displayTranscript.length === 0 ? (
                <p className="live-transcript-empty">
                  {backendMeetingId ? "아직 대화가 없습니다." : "아직 대화가 없습니다. 아래에서 질문을 시뮬레이션해보세요."}
                </p>
              ) : (
                displayTranscript.map((entry) => (
                  <LiveTranscriptRow
                    key={entry.id}
                    entry={entry}
                    onResolveNumberConfirmation={(decision) =>
                      resolveNumberConfirmation(meeting.id, entry.id, decision)
                    }
                  />
                ))
              )}
            </div>
            {backendMeetingId ? (
              <p className="live-transcript-empty" style={{ padding: "8px 16px" }}>
                🎙️ 실제 음성 대화가 실시간으로 표시됩니다
              </p>
            ) : (
              <form onSubmit={handleAsk} className="live-ask-form">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="상대방 질문 시뮬레이션 (백엔드 연결 전 데모용 — 실제 통화 중엔 위 실시간 대화로 대체됩니다)"
                  className="live-ask-input"
                  disabled={asking}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={asking}>
                  {asking ? "AI 판단 중…" : "전송"}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="live-call-controls">
          {backendStatus === "실행중" ? (
            <>
              <div className="live-control-btn-group">
                <button type="button" className="live-control-btn" onClick={handleToggleMute}>
                  <span className={`live-control-btn-icon ${muted ? "active" : ""}`}>
                    <img src="/icons/icon-mic.svg" alt="" width={18} height={18} />
                  </span>
                  <span className="live-control-label">{muted ? "음소거 해제" : "음소거"}</span>
                </button>
                <button type="button" className="live-control-btn" onClick={handleStopBackendMeeting}>
                  <span className="live-control-btn-icon danger">
                    <img src="/icons/icon-phone-end.svg" alt="" width={18} height={18} />
                  </span>
                  <span className="live-control-label">종료</span>
                </button>
                <button type="button" className="live-control-btn" onClick={handleToggleFullscreen}>
                  <span className="live-control-btn-icon" style={{ fontSize: 16 }}>
                    {isFullscreen ? "⤡" : "⤢"}
                  </span>
                  <span className="live-control-label">{isFullscreen ? "전체화면 해제" : "전체화면"}</span>
                </button>
              </div>
              <div className="live-control-status">
                <span className="live-status-pill">
                  <span className={`live-status-dot ${VOICE_STATUS_DOT[voiceStatus]}`} />
                  음성 {voiceStatus}
                </span>
                {remoteParticipants.length > 0 && (
                  <span className="live-status-pill">참가자 {remoteParticipants.length}명 연결됨</span>
                )}
                <span className="live-status-pill">
                  AI 대리 진행 중 — <strong>승인 범위 내</strong>
                </span>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartBackendMeeting}
                disabled={backendStatus === "동기화중" || backendStatus === "시작중"}
              >
                {backendStatus === "동기화중"
                  ? "회의 동기화 중…"
                  : backendStatus === "시작중"
                    ? "AI 진행자 참여시키는 중…"
                    : "미팅 시작"}
              </button>
              <div className="live-control-status">
                <span className="live-status-pill">
                  <span
                    className={`live-status-dot ${backendStatus === "오류" ? "danger" : "neutral"}`}
                  />
                  백엔드 {backendStatus}
                </span>
              </div>
            </>
          )}
        </div>

        {(voiceError || backendError) && (
          <div className="live-call-errors">
            {voiceError && <p className="live-error-text">{voiceError}</p>}
            {backendError && <p className="live-error-text">{backendError}</p>}
          </div>
        )}
      </div>

      <div className="two-col">
        <div>
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
                        <span
                          className={`badge badge-${p.withinRange === null ? "neutral" : p.withinRange ? "success" : "danger"}`}
                        >
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

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** 참가자 타일 안의 장식용 파형 — 실제 오디오 레벨이 아니라 연결 여부만 반영한다. */
function LiveWaveform({ active, tone }: { active: boolean; tone: "blue" | "purple" }) {
  // 고정된 높이 패턴을 써서 리렌더마다 파형이 흔들리지 않게 한다.
  const heights = [10, 22, 28, 18, 12, 20, 26, 16, 24, 14, 20, 27, 15, 11, 23];
  return (
    <div className={`live-waveform ${active ? "" : "idle"}`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`live-waveform-bar ${tone === "purple" ? "purple" : ""}`}
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
}

function speakerAvatarClass(speaker: Speaker): string {
  if (speaker === "ai") return "ai";
  if (speaker === "host") return "host";
  return "";
}

function speakerAvatarLabel(speaker: Speaker, speakerLabel: string): string {
  if (speaker === "ai") return "✨";
  return speakerLabel.trim().slice(0, 1) || "A";
}

function statusTagFor(matchResult?: MatchResult): { label: string; tone: string } | null {
  if (!matchResult) return null;
  if (matchResult.numberConfirmation) {
    switch (matchResult.numberConfirmation.status) {
      case "대기중":
        return { label: "🔢 숫자 확인", tone: "warn" };
      case "확인됨":
        return { label: "✅ 확인됨", tone: "success" };
      case "거부됨":
        return { label: "❌ 거부됨", tone: "danger" };
      case "미응답":
        return { label: "⏱ 미응답", tone: "danger" };
    }
  }
  if (matchResult.limitationNote) {
    return { label: "⚠ 제한 전달", tone: "warn" };
  }
  if (matchResult.matched) {
    return { label: "✅ 매칭됨", tone: "success" };
  }
  return { label: "⏸ 보류", tone: "warn" };
}

/** 실시간 대화 패널의 메시지 한 행. Figma 22:1895/22:1906 등 반복 패턴을 기반으로 만들었다. */
function LiveTranscriptRow({
  entry,
  onResolveNumberConfirmation,
}: {
  entry: TranscriptEntry;
  onResolveNumberConfirmation: (decision: "확인됨" | "거부됨") => void;
}) {
  const tag = statusTagFor(entry.matchResult);
  const nc = entry.matchResult?.numberConfirmation;

  return (
    <div className={`live-transcript-row ${entry.speaker !== "counterpart" ? "ai" : ""}`}>
      <div className="live-transcript-row-header">
        <div className="live-transcript-speaker">
          <span className={`live-transcript-avatar ${speakerAvatarClass(entry.speaker)}`}>
            {speakerAvatarLabel(entry.speaker, entry.speakerLabel)}
          </span>
          <span className={`live-transcript-speaker-name ${speakerAvatarClass(entry.speaker)}`}>
            {entry.speakerLabel}
            {entry.speaker === "counterpart" ? " (상대방)" : ""}
          </span>
        </div>
        {tag && <span className={`live-transcript-status-tag ${tag.tone}`}>{tag.label}</span>}
      </div>

      <p className="live-transcript-text">{entry.text}</p>
      {entry.translatedText && <p className="live-transcript-translated">{entry.translatedText}</p>}

      {entry.matchResult && !entry.matchResult.matched && entry.matchResult.holdReason && (
        <p className="live-transcript-note">{entry.matchResult.holdReason}</p>
      )}
      {entry.matchResult?.limitationNote && (
        <p className="live-transcript-note">제한사항: {entry.matchResult.limitationNote}</p>
      )}
      {entry.matchResult?.matched && entry.matchResult.intentMatchReasoning && (
        <p className="live-transcript-note">{entry.matchResult.intentMatchReasoning}</p>
      )}

      {nc && (
        <div className={`live-transcript-number-confirm ${nc.status === "대기중" ? "" : "resolved"}`}>
          {nc.status === "대기중" && (
            <>
              🔢 핵심 수치 포함 — 상대방 확인 대기 중 ({nc.secondsLeft}초)
              <div className="live-transcript-number-confirm-actions">
                <button className="btn btn-sm btn-primary" onClick={() => onResolveNumberConfirmation("확인됨")}>
                  O 확인
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => onResolveNumberConfirmation("거부됨")}>
                  X 거부
                </button>
              </div>
            </>
          )}
          {nc.status === "확인됨" && "✅ 전달 확정됨"}
          {nc.status === "거부됨" && "❌ 거부됨 — 자동 보류 처리됨"}
          {nc.status === "미응답" && "⏱ 10초 미응답 — 자동 보류 처리됨 (자동 승인 아님)"}
        </div>
      )}
    </div>
  );
}
