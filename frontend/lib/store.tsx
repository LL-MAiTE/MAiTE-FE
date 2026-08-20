"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  ConfidenceLevel,
  HoldItem,
  HoldItemStatus,
  HoldReasonType,
  MandatoryReviewItem,
  MandatoryReviewStatus,
  MAX_REOPEN_COUNT,
  Meeting,
  MeetingStatus,
  NUMBER_CONFIRMATION_TIMEOUT_SECONDS,
  NumberConfirmationStatus,
  Position,
  PositionApprovalStatus,
  PositionField,
  Project,
  ProjectDocument,
  TranscriptEntry,
  TranscriptReviewDecision,
} from "./types";
import { matchMockIntentOrHold } from "./mockAi";
import { useAuth } from "./auth";

/**
 * 클라이언트 사이드 "mock 백엔드". 원래는 실 서버 API가 전혀 없어서 프로젝트/문서/회의를
 * 전부 React Context + localStorage로 들고 있었는데, 이제 **프로젝트**와 **문서**는
 * 실제 백엔드가 원본이다:
 *  - createProject/deleteProject가 /api/backend/projects를 호출하고, 로그인 사용자가
 *    바뀔 때마다 그 사람의 실제 프로젝트 목록을 가져온다.
 *  - addDocument/deleteDocument가 /api/backend/documents를 호출한다 — 수동 업로드든
 *    Git 연동이든 이제 구분 없이 같은 API(source_document)를 쓴다.
 * 회의/안건은 아직 이 mock 구조 그대로다(진행 중인 마이그레이션 — [[tkzr-scope-decisions]]
 * 참고). 컴포넌트 쪽 훅 사용법(useStore())은 마이그레이션 전후로 그대로 유지되도록 설계했다.
 */

// 로그인 사용자별로 다른 localStorage 네임스페이스를 쓴다. 예전엔 키가 고정이라, 같은
// 브라우저에서 계정을 바꿔 로그인해도 이전 계정의 회의/문서가 그대로 남아 보이는 문제가
// 있었다(실사용 중 발견 — 프로젝트는 이제 백엔드가 원본이라 계정별로 걸러지지만, 회의는
// 아직 이 localStorage가 원본이라 안 걸러지고 있었음). 계정 전환 시 이전 계정 데이터가
// 지워지는 게 아니라 그 계정 고유의 키에 그대로 남아있고, 그 계정으로 다시 로그인하면
// 돌아온다.
function storageKeyFor(userId: string | null | undefined): string {
  return userId ? `tkzr_store_v1:${userId}` : "tkzr_store_v1:anonymous";
}

interface StoreState {
  projects: Project[];
  meetings: Meeting[];
}

// -----------------------------------------------------------------------
// 회의 준비(Agenda·Position) — 이제 실제 백엔드가 원본이다. meeting.id는 항상
// 백엔드 Agenda UUID를 그대로 쓴다. 아래는 그 API 호출부 + 백엔드 응답을 프론트
// Position 모양으로 매핑하는 헬퍼들이다. [[tkzr-scope-decisions]]
// -----------------------------------------------------------------------

const APPROVAL_STATUS_MAP: Record<string, PositionApprovalStatus> = {
  DRAFT: "초안",
  APPROVED: "승인",
  REVISED_APPROVED: "수정후승인",
  REJECTED: "반려",
  PENDING: "초안", // 지금 어떤 엔드포인트도 PENDING을 만들지 않아 사실상 안 씀 — 안전한 기본값.
};

const CONFIDENCE_MAP: Record<string, ConfidenceLevel> = {
  DOCUMENT_BASED: "문서근거명확",
  ESTIMATED: "추정",
};

/** 백엔드 PositionResponse → 프론트 Position. sourceDocumentTitle은 백엔드가 id만 주기
 * 때문에, 넘겨받은 project.documents에서 제목을 찾아 채운다(문서는 Phase 4에서 이미
 * 실 데이터라 항상 최신 목록을 갖고 있음). reasoning은 백엔드에 없는 필드라 빈 문자열. */
function mapBackendPosition(raw: Record<string, unknown>, project: Project | undefined): Position {
  const sourceDocumentId = raw.sourceDocumentId as string | null;
  const sourceDoc = sourceDocumentId ? project?.documents.find((d) => d.id === sourceDocumentId) : undefined;
  return {
    id: raw.id as string,
    topic: raw.topic as string,
    version: raw.version as number,
    origin: raw.generatedBy === "USER" ? "user" : "ai",
    approvalStatus: APPROVAL_STATUS_MAP[raw.approvalStatus as string] ?? "초안",
    questionText: raw.questionText as string,
    answer: (raw.answer as string | null) ?? null,
    preference: (raw.preference as string | null) ?? null,
    concessionRange: (raw.concessionRange as string | null) ?? null,
    dealbreaker: (raw.dealbreaker as string | null) ?? null,
    priority: (raw.priority as number | null) ?? null,
    scheduleConstraint: (raw.scheduleConstraint as string | null) ?? null,
    activeFields: (raw.activeFields as PositionField[]) ?? [],
    confidenceLevel: CONFIDENCE_MAP[raw.confidenceLevel as string] ?? "추정",
    sourceDocumentTitle: sourceDoc?.title ?? null,
    reasoning: "",
  };
}

async function postJson<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `요청에 실패했습니다: ${url}`);
  return data as T;
}

/** 선택한 문서를 참조 문서로 등록/재활성화한다. sourceDocumentId → AgendaReferenceDocument id 맵을 반환. */
async function selectReferenceDocuments(
  agendaId: string,
  sourceDocumentIds: string[]
): Promise<Record<string, string>> {
  if (sourceDocumentIds.length === 0) return {};
  const body = await postJson<{ referenceDocuments: { id: string; sourceDocumentId: string }[] }>(
    `/api/backend/agendas/${agendaId}/reference-documents`,
    { sourceDocumentIds }
  );
  const map: Record<string, string> = {};
  for (const ref of body.referenceDocuments) map[ref.sourceDocumentId] = ref.id;
  return map;
}

async function setReferenceDocumentExcluded(refDocId: string, excluded: boolean): Promise<void> {
  const res = await fetch(`/api/backend/agenda-reference-documents/${refDocId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excluded }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "참조 문서 상태 변경에 실패했습니다.");
  }
}

async function fetchAgendaPositions(agendaId: string, project: Project | undefined): Promise<Position[]> {
  const res = await fetch(`/api/backend/agendas/${agendaId}/positions`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "안건 목록을 불러오지 못했습니다.");
  return ((body.positions as Record<string, unknown>[]) ?? []).map((p) => mapBackendPosition(p, project));
}

async function deleteBackendPositionCall(positionId: string): Promise<void> {
  const res = await fetch(`/api/backend/positions/${positionId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "안건 삭제에 실패했습니다.");
  }
}

/** 문서 근거로 새 AI 초안을 생성하고, 방금 생성된 것만 프론트 Position으로 매핑해 돌려준다. */
async function generateDraftPositionsOnBackend(
  agendaId: string,
  project: Project | undefined
): Promise<Position[]> {
  const body = await postJson<{ positions: Record<string, unknown>[] }>(
    `/api/backend/agendas/${agendaId}/draft-positions`
  );
  return body.positions.map((p) => mapBackendPosition(p, project));
}

// -----------------------------------------------------------------------
// 회의 목록/실데이터 하이드레이션 — Phase 5로 안건·포지션은 백엔드가 원본이 됐지만,
// meeting 목록 자체(어떤 안건들이 있는지)는 이 작업 전까지도 localStorage(브라우저별)만
// 원본이었다 — 다른 브라우저·기기로 로그인하면 이미 만든 회의가 안 보이는 문제가 있었음.
// 아래는 그걸 고치는 하이드레이션: 로그인 시(전체) + 프로젝트 상세 진입 시(해당 프로젝트만)
// 안건을 백엔드에서 다시 가져와 로컬 meetings를 채운다 — documents와 같은 패턴이다.
// (참고: 보류함/필수검토 "전역 모아보기" 화면의 후속답변·재오픈 등 액션 버튼은 아직
// 이 하이드레이션으로 채운 로컬 값을 그대로 mutate만 한다 — 실제 백엔드 반영은 다음
// 작업(팀 역할분담 A) 범위다.)
// -----------------------------------------------------------------------

const AGENDA_STATUS_MAP: Record<string, MeetingStatus> = {
  READY: "준비중",
  PREPARING: "승인대기",
  APPROVED: "승인대기",
};

const HOLD_ITEM_STATUS_MAP: Record<string, HoldItemStatus> = {
  UNRESOLVED: "보류",
  AWAITING_ANSWER: "후속답변대기",
  CONFIRMED_IMMEDIATE: "확정",
  CONFIRMED_TIMEOUT: "확정",
  REOPENED: "보류",
  NEEDS_REALTIME: "실시간조율필요",
};

const REQUIRED_REVIEW_STATUS_MAP: Record<string, MandatoryReviewStatus> = {
  CONDITIONAL: "확인전",
  CONFIRMED: "확인후확정",
  REVISED: "확인후확정",
  WITHDRAWN: "확인전",
};

function mapBackendTranscripts(raw: Record<string, unknown>[]): TranscriptEntry[] {
  return raw.map((t) => {
    const speakerLabel = (t.speakerLabel as string) ?? "";
    const isAgent = speakerLabel.startsWith("AI");
    return {
      id: t.id as string,
      speaker: isAgent ? "ai" : "counterpart",
      speakerLabel: isAgent ? "AI 진행자" : "상대방",
      timestamp: new Date(t.spokenAt as string).toLocaleTimeString("ko-KR", { hour12: false }),
      text: t.text as string,
      translatedText: null,
    };
  });
}

function mapBackendHoldItem(raw: Record<string, unknown>, logCaptionById: Map<string, string | null>): HoldItem {
  const meetingLogId = raw.meetingLogId as string | null;
  return {
    id: raw.id as string,
    meetingId: raw.meetingId as string,
    relatedTopic: null,
    reasonType: "핵심의도불일치",
    reason: (raw.reason as string | null) ?? (meetingLogId ? logCaptionById.get(meetingLogId) ?? "" : "") ?? "",
    transcriptEntryId: null,
    status: HOLD_ITEM_STATUS_MAP[raw.status as string] ?? "보류",
    followupAnswer: (raw.answerText as string | null) ?? null,
    followupSentAt: (raw.answeredAt as string | null) ?? null,
    followupDeadline: null,
    reopenCount: (raw.reopenCount as number) ?? 0,
    reopenHistory: [],
  };
}

function mapBackendRequiredReview(
  raw: Record<string, unknown>,
  meetingId: string,
  logCaptionById: Map<string, string | null>
): MandatoryReviewItem {
  const meetingLogId = raw.meetingLogId as string;
  return {
    id: raw.id as string,
    meetingId,
    relatedTopic: null,
    label: logCaptionById.get(meetingLogId) || "필수 검토 항목",
    requestedByCounterpart: true,
    status: REQUIRED_REVIEW_STATUS_MAP[raw.status as string] ?? "확인전",
    confirmationNote: null,
  };
}

/**
 * 안건 하나를 로컬 Meeting으로 완전히 재구성한다: 안건 자체 필드 + 포지션 + 참조 문서
 * 선택 상태 + (라이브를 한 번이라도 시작했으면) 실제 통화에서 쌓인 대화·보류·필수검토까지.
 * project를 안 넘기면(예: 로그인 직후 부트스트랩) sourceDocumentTitle이 비어 보일 수 있는데
 * — 그 프로젝트 상세 화면에 들어가면 문서 목록과 함께 다시 채워진다.
 */
async function fetchAgendaAsMeeting(
  agenda: Record<string, unknown>,
  project: Project | undefined
): Promise<Meeting> {
  const agendaId = agenda.id as string;

  const [positions, refDocsRes, meetingsRes] = await Promise.all([
    fetchAgendaPositions(agendaId, project),
    fetch(`/api/backend/agendas/${agendaId}/reference-documents`)
      .then((r) => r.json())
      .catch(() => ({ referenceDocuments: [] })),
    fetch(`/api/backend/agendas/${agendaId}/meetings`)
      .then((r) => r.json())
      .catch(() => ({ meetings: [] })),
  ]);

  const referenceDocRefIds: Record<string, string> = {};
  const selectedDocumentIds: string[] = [];
  for (const ref of (refDocsRes.referenceDocuments ?? []) as Record<string, unknown>[]) {
    const sourceDocumentId = ref.sourceDocumentId as string;
    referenceDocRefIds[sourceDocumentId] = ref.id as string;
    if (!ref.excluded) selectedDocumentIds.push(sourceDocumentId);
  }

  const backendMeetings = (meetingsRes.meetings ?? []) as Record<string, unknown>[];
  const latestBackendMeeting = backendMeetings[backendMeetings.length - 1];

  let status = AGENDA_STATUS_MAP[agenda.status as string] ?? "승인대기";
  let transcript: TranscriptEntry[] = [];
  let holdItems: HoldItem[] = [];
  let mandatoryReviewItems: MandatoryReviewItem[] = [];

  if (latestBackendMeeting) {
    const backendMeetingId = latestBackendMeeting.id as string;
    const [transcriptsRes, holdItemsRes, requiredReviewsRes, logsRes] = await Promise.all([
      fetch(`/api/backend/meeting-transcripts?backendMeetingId=${backendMeetingId}`)
        .then((r) => r.json())
        .catch(() => ({ transcripts: [] })),
      fetch(`/api/backend/hold-items?backendMeetingId=${backendMeetingId}`)
        .then((r) => r.json())
        .catch(() => ({ holdItems: [] })),
      fetch(`/api/backend/required-reviews?backendMeetingId=${backendMeetingId}`)
        .then((r) => r.json())
        .catch(() => ({ requiredReviews: [] })),
      fetch(`/api/backend/meeting-logs?backendMeetingId=${backendMeetingId}`)
        .then((r) => r.json())
        .catch(() => ({ logs: [] })),
    ]);

    const logCaptionById = new Map<string, string | null>(
      ((logsRes.logs ?? []) as Record<string, unknown>[]).map((l) => [
        l.id as string,
        (l.translatedCaption as string | null) ?? (l.limitationNote as string | null),
      ])
    );

    transcript = mapBackendTranscripts((transcriptsRes.transcripts ?? []) as Record<string, unknown>[]);
    holdItems = ((holdItemsRes.holdItems ?? []) as Record<string, unknown>[]).map((h) =>
      mapBackendHoldItem(h, logCaptionById)
    );
    mandatoryReviewItems = ((requiredReviewsRes.requiredReviews ?? []) as Record<string, unknown>[]).map((r) =>
      mapBackendRequiredReview(r, backendMeetingId, logCaptionById)
    );

    const meetingStatus = latestBackendMeeting.status as string;
    if (meetingStatus === "IN_PROGRESS") status = "라이브";
    else if (meetingStatus === "PENDING_FOLLOWUP") status = "후속답변대기";
    else if (meetingStatus === "CLOSED") status = "종료";
  }

  return {
    id: agendaId,
    projectId: agenda.projectId as string,
    title: agenda.title as string,
    purpose: (agenda.purpose as string) ?? "",
    counterpartInfo: (agenda.counterpartCountry as string) ?? "",
    counterpartLanguageCode: (agenda.counterpartLanguage as string) ?? "ko-KR",
    selectedDocumentIds,
    referenceDocRefIds,
    status,
    positions,
    transcript,
    holdItems,
    mandatoryReviewItems,
    createdAt: (agenda.createdAt as string) ?? new Date().toISOString(),
  };
}

/** 프로젝트 하나에 딸린 회의(안건) 전체를 백엔드 기준으로 다시 구성한다. */
async function fetchProjectMeetings(projectId: string, project: Project | undefined): Promise<Meeting[]> {
  const res = await fetch(`/api/backend/projects/${projectId}/agendas`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "회의 목록을 불러오지 못했습니다.");
  const agendas = (body.agendas ?? []) as Record<string, unknown>[];
  return Promise.all(agendas.map((agenda) => fetchAgendaAsMeeting(agenda, project)));
}

function seedState(): StoreState {
  // 예전엔 여기서 데모용 mock 프로젝트/회의(lib/mockSeed.ts)를 채워서 시작했는데,
  // 이제 실제 로그인 계정이 있어서 매 계정이 남의 가짜 데모 데이터를 보게 되는 게
  // 더 어색하다. 빈 상태로 시작하고, 홈 화면의 EmptyState가 "새 프로젝트 만들기"로
  // 안내한다.
  return { projects: [], meetings: [] };
}

let idSeq = 0;
function genId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * 버전관리 규칙: "AI 대리 진행은 항상 최신 체크포인트의 스냅샷(topic별 최신 활성 버전
 * 모음)만 참조"한다. 정상 흐름에서는 topic이 중복될 일이 없지만(사용자 직접추가/재생성
 * 로직이 막아줌), 혹시라도 같은 topic으로 승인된 안건이 두 개 이상 남아있는 엣지케이스에
 * 대비해 여기서 한 번 더 topic별 최신 버전(version 값이 가장 큰 것) 하나만 남긴다.
 */
function buildApprovedSnapshot(positions: Position[]): Position[] {
  const approved = positions.filter(
    (p) => p.approvalStatus === "승인" || p.approvalStatus === "수정후승인"
  );
  const latestByTopic = new Map<string, Position>();
  for (const p of approved) {
    const existing = latestByTopic.get(p.topic);
    if (!existing || p.version > existing.version) {
      latestByTopic.set(p.topic, p);
    }
  }
  return Array.from(latestByTopic.values());
}

// -----------------------------------------------------------------------
// Context 타입
// -----------------------------------------------------------------------

interface StoreContextValue {
  projects: Project[];
  meetings: Meeting[];

  getProject: (projectId: string) => Project | undefined;
  getMeeting: (meetingId: string) => Meeting | undefined;
  getMeetingsByProject: (projectId: string) => Meeting[];

  createProject: (name: string, description: string) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  /** 문서 목록을 백엔드에서 다시 가져와 project.documents를 갱신한다 — 페이지 마운트 시,
   * 또는 Git 연동 동기화처럼 store가 모르게 문서가 바뀌었을 때 호출한다. */
  refreshProjectDocuments: (projectId: string) => Promise<void>;
  /** 이 프로젝트의 회의(안건) 목록을 백엔드에서 다시 가져와 채운다 — 다른 브라우저·기기에서
   * 만든 회의를 반영하거나, 방금 실제 라이브가 끝나 상태·보류함·필수검토가 바뀌었을 때 쓴다. */
  refreshProjectMeetings: (projectId: string) => Promise<void>;
  addDocument: (
    projectId: string,
    doc: { title: string; content: string; isCoreContext: boolean }
  ) => Promise<void>;
  deleteDocument: (projectId: string, documentId: string) => Promise<void>;

  createMeeting: (input: {
    projectId: string;
    title: string;
    purpose: string;
    counterpartInfo: string;
    counterpartLanguageCode?: string;
    selectedDocumentIds: string[];
  }) => Promise<Meeting>;
  deleteMeeting: (meetingId: string) => void;
  regenerateDraftPositions: (meetingId: string, selectedDocumentIds: string[]) => Promise<void>;

  approvePosition: (meetingId: string, positionId: string) => Promise<void>;
  rejectPosition: (meetingId: string, positionId: string) => Promise<void>;
  /** 필드 수정 + "수정후승인" 상태를 한 번에 반영한다(백엔드가 새 버전을 만든다). */
  revisePosition: (meetingId: string, positionId: string, updates: Partial<Position>) => Promise<void>;
  /** 소프트 삭제 — 매칭 대상에서 제외되고 목록에서도 사라진다. */
  deletePosition: (meetingId: string, positionId: string) => Promise<void>;
  addUserPosition: (
    meetingId: string,
    input: {
      topic: string;
      questionText: string;
      fields: Partial<Record<PositionField, string | number>>;
    }
  ) => Promise<void>;

  startLiveMeeting: (meetingId: string) => void;
  askQuestion: (meetingId: string, questionText: string) => Promise<void>;
  tickNumberConfirmation: (meetingId: string, transcriptEntryId: string) => void;
  resolveNumberConfirmation: (
    meetingId: string,
    transcriptEntryId: string,
    outcome: Extract<NumberConfirmationStatus, "확인됨" | "거부됨" | "미응답">
  ) => void;

  submitHoldFollowup: (meetingId: string, holdItemId: string, answer: string) => void;
  reopenHoldItem: (meetingId: string, holdItemId: string, note: string) => void;
  confirmHoldItem: (meetingId: string, holdItemId: string) => void;

  setTranscriptReviewDecision: (
    meetingId: string,
    transcriptEntryId: string,
    decision: TranscriptReviewDecision,
    note: string
  ) => void;

  confirmMandatoryReviewItem: (meetingId: string, itemId: string, note: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

// -----------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>(seedState);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();

  // 로그인 사용자가 정해지거나 바뀔 때마다 그 사람 전용 localStorage 키를 다시 읽는다
  // (없으면 빈 상태로 시작 — 다른 계정 데이터가 섞여 보이면 안 되므로).
  useEffect(() => {
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(storageKeyFor(user?.id));
      if (raw) {
        const parsed = JSON.parse(raw) as StoreState;
        // 예전에 lib/mockSeed.ts가 브라우저에 심어둔 데모 프로젝트("project_dashboard",
        // id가 고정 문자열)가 이미 localStorage에 저장돼 있으면, mock 시드를 지운 뒤에도
        // 계속 남아 보인다 — 여기서 한 번 걸러낸다. 실제로 만든 프로젝트는 genId()가
        // 생성한 다른 형식의 id를 쓰므로 이 필터에 걸리지 않는다.
        parsed.projects = parsed.projects.filter((p) => p.id !== "project_dashboard");
        parsed.meetings = parsed.meetings.filter((m) => m.projectId !== "project_dashboard");
        setState(parsed);
      } else {
        setState(seedState());
      }
    } catch {
      // 저장된 값이 깨졌으면 seed로 계속 진행
      setState(seedState());
    }
    setHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKeyFor(user?.id), JSON.stringify(state));
  }, [state, hydrated, user?.id]);

  // 로그인 사용자가 정해지면(또는 바뀌면) 그 사람의 실제 프로젝트 목록을 백엔드에서
  // 가져온다. documents/meetingIds는 아직 로컬(mock)이 원본이라, 같은 id로 이미 로컬에
  // 있던 프로젝트면 그 값을 그대로 이어붙이고 백엔드 목록에 없는 프로젝트(다른 계정의
  // 예전 로컬 데이터 등)는 버린다.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/backend/projects")
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        const backendProjects: { id: string; name: string; description: string | null }[] =
          data.projects ?? [];
        setState((prev) => {
          const byId = new Map(prev.projects.map((p) => [p.id, p]));
          const projects: Project[] = backendProjects.map((bp) => {
            const existing = byId.get(bp.id);
            return {
              id: bp.id,
              name: bp.name,
              description: bp.description ?? "",
              documents: existing?.documents ?? [],
              meetingIds: existing?.meetingIds ?? [],
            };
          });
          return { ...prev, projects };
        });

        // 프로젝트 목록을 받아온 김에 그 프로젝트들에 딸린 회의(안건)도 전부 백엔드
        // 기준으로 다시 채운다 — 안 그러면 다른 브라우저/기기에서 로그인했을 때 이미
        // 만든 회의가 하나도 안 보인다(회의 목록/보류함/필수검토 전역 화면 전부 포함).
        // project를 안 넘겨서(문서 목록을 아직 안 가져온 시점) sourceDocumentTitle은
        // 이 시점엔 비어 보일 수 있는데, 해당 프로젝트 상세로 들어가면 다시 채워진다.
        const results = await Promise.allSettled(
          backendProjects.map((bp) => fetchProjectMeetings(bp.id, undefined))
        );
        if (cancelled) return;
        setState((prev) => {
          const meetingsByProject = new Map<string, Meeting[]>();
          results.forEach((r, i) => {
            if (r.status === "fulfilled") meetingsByProject.set(backendProjects[i].id, r.value);
          });
          const untouched = prev.meetings.filter((m) => !meetingsByProject.has(m.projectId));
          const refreshed = Array.from(meetingsByProject.values()).flat();
          return {
            ...prev,
            meetings: [...untouched, ...refreshed],
            projects: prev.projects.map((p) =>
              meetingsByProject.has(p.id)
                ? { ...p, meetingIds: (meetingsByProject.get(p.id) ?? []).map((m) => m.id) }
                : p
            ),
          };
        });
      })
      .catch(() => {
        // 실패해도 로컬 상태 그대로 유지 — 새로고침하면 다시 시도된다.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const updateMeeting = useCallback((meetingId: string, updater: (m: Meeting) => Meeting) => {
    setState((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) => (m.id === meetingId ? updater(m) : m)),
    }));
  }, []);

  const recomputeStatus = (meeting: Meeting): Meeting => {
    if (meeting.status !== "라이브" && meeting.status !== "후속답변대기") return meeting;
    const hasPending = meeting.holdItems.some(
      (h) => h.status === "보류" || h.status === "후속답변대기"
    );
    if (hasPending) return { ...meeting, status: "후속답변대기" };
    if (meeting.holdItems.length > 0) return { ...meeting, status: "종료" };
    return meeting;
  };

  const getProject = useCallback(
    (projectId: string) => state.projects.find((p) => p.id === projectId),
    [state.projects]
  );
  const getMeeting = useCallback(
    (meetingId: string) => state.meetings.find((m) => m.id === meetingId),
    [state.meetings]
  );
  const getMeetingsByProject = useCallback(
    (projectId: string) => state.meetings.filter((m) => m.projectId === projectId),
    [state.meetings]
  );

  const createProject = useCallback(async (name: string, description: string): Promise<Project> => {
    const res = await fetch("/api/backend/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "프로젝트 생성에 실패했습니다.");

    const project: Project = {
      id: body.project.id,
      name: body.project.name,
      description: body.project.description ?? "",
      documents: [],
      meetingIds: [],
    };
    setState((prev) => ({ ...prev, projects: [...prev.projects, project] }));
    return project;
  }, []);

  // 프로젝트를 지우면 거기 딸린 미팅도 고아로 남지 않게 같이 지운다.
  // 백엔드가 agenda(회의 준비)가 이미 있는 프로젝트는 409로 거부하니, 그 경우 로컬 상태는
  // 그대로 두고 에러를 그대로 던져서 호출부(화면)가 이유를 보여줄 수 있게 한다.
  const deleteProject = useCallback(async (projectId: string) => {
    const res = await fetch(`/api/backend/projects/${projectId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "프로젝트 삭제에 실패했습니다.");

    setState((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== projectId),
      meetings: prev.meetings.filter((m) => m.projectId !== projectId),
    }));
  }, []);

  const deleteMeeting = useCallback((meetingId: string) => {
    setState((prev) => ({
      ...prev,
      meetings: prev.meetings.filter((m) => m.id !== meetingId),
      projects: prev.projects.map((p) =>
        p.meetingIds.includes(meetingId)
          ? { ...p, meetingIds: p.meetingIds.filter((id) => id !== meetingId) }
          : p
      ),
    }));
  }, []);

  const applyBackendDocuments = useCallback((projectId: string, rawDocuments: unknown[]) => {
    const documents: ProjectDocument[] = rawDocuments.map((raw) => {
      const d = raw as {
        id: string;
        title: string;
        path: string | null;
        isCoreContext: boolean;
        syncedAt: string | null;
        lastModifiedAt: string | null;
      };
      return {
        id: d.id,
        title: d.title,
        path: d.path,
        isCoreContext: d.isCoreContext,
        updatedAt: d.syncedAt ?? d.lastModifiedAt ?? new Date().toISOString(),
      };
    });
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === projectId ? { ...p, documents } : p)),
    }));
  }, []);

  const refreshProjectDocuments = useCallback(
    async (projectId: string) => {
      const res = await fetch(`/api/backend/documents?projectId=${projectId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "문서 목록을 불러오지 못했습니다.");
      applyBackendDocuments(projectId, body.documents ?? []);
    },
    [applyBackendDocuments]
  );

  const refreshProjectMeetings = useCallback(
    async (projectId: string) => {
      const project = state.projects.find((p) => p.id === projectId);
      const meetings = await fetchProjectMeetings(projectId, project);
      setState((prev) => ({
        ...prev,
        meetings: [...prev.meetings.filter((m) => m.projectId !== projectId), ...meetings],
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, meetingIds: meetings.map((m) => m.id) } : p
        ),
      }));
    },
    [state.projects]
  );

  const addDocument = useCallback(
    async (projectId: string, doc: { title: string; content: string; isCoreContext: boolean }) => {
      const res = await fetch("/api/backend/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...doc }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "문서 업로드에 실패했습니다.");
      await refreshProjectDocuments(projectId);
    },
    [refreshProjectDocuments]
  );

  const deleteDocument = useCallback(
    async (projectId: string, documentId: string) => {
      const res = await fetch(`/api/backend/documents/${documentId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "문서 삭제에 실패했습니다.");
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, documents: p.documents.filter((d) => d.id !== documentId) } : p
        ),
      }));
    },
    []
  );

  const createMeeting = useCallback(
    async (input: {
      projectId: string;
      title: string;
      purpose: string;
      counterpartInfo: string;
      counterpartLanguageCode?: string;
      selectedDocumentIds: string[];
    }): Promise<Meeting> => {
      const agendaBody = await postJson<{ agenda: { id: string } }>("/api/backend/agendas", {
        projectId: input.projectId,
        title: input.title,
        purpose: input.purpose,
        counterpartInfo: input.counterpartInfo,
        counterpartLanguageCode: input.counterpartLanguageCode,
      });
      const agendaId = agendaBody.agenda.id;

      const referenceDocRefIds = await selectReferenceDocuments(agendaId, input.selectedDocumentIds);
      const project = state.projects.find((p) => p.id === input.projectId);
      const positions = await generateDraftPositionsOnBackend(agendaId, project);

      const meeting: Meeting = {
        id: agendaId,
        projectId: input.projectId,
        title: input.title,
        purpose: input.purpose,
        counterpartInfo: input.counterpartInfo,
        counterpartLanguageCode: input.counterpartLanguageCode ?? "ko-KR",
        selectedDocumentIds: input.selectedDocumentIds,
        referenceDocRefIds,
        status: "승인대기",
        positions,
        transcript: [],
        holdItems: [],
        mandatoryReviewItems: [],
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === input.projectId ? { ...p, meetingIds: [...p.meetingIds, meeting.id] } : p
        ),
        meetings: [...prev.meetings, meeting],
      }));

      return meeting;
    },
    [state.projects]
  );

  const regenerateDraftPositions = useCallback(
    async (meetingId: string, selectedDocumentIds: string[]): Promise<void> => {
      const meeting = state.meetings.find((item) => item.id === meetingId);
      if (!meeting) throw new Error("회의를 찾을 수 없습니다.");
      const project = state.projects.find((p) => p.id === meeting.projectId);

      // 참조 문서 선택 변경분을 백엔드에 반영한다: 새로 고른 문서는 등록, 껐다가 다시 켠
      // 문서는 exclude 해제, 뺀 문서는 exclude 처리(레코드 자체는 남겨둔다 — 버전 이력 보존).
      const existingIds = Object.keys(meeting.referenceDocRefIds);
      const newDocIds = selectedDocumentIds.filter((id) => !existingIds.includes(id));
      const reAddedIds = selectedDocumentIds.filter((id) => existingIds.includes(id));
      const removedIds = existingIds.filter((id) => !selectedDocumentIds.includes(id));

      const newRefs = await selectReferenceDocuments(meeting.id, newDocIds);
      await Promise.all(
        reAddedIds.map((id) => setReferenceDocumentExcluded(meeting.referenceDocRefIds[id], false))
      );
      await Promise.all(
        removedIds.map((id) => setReferenceDocumentExcluded(meeting.referenceDocRefIds[id], true))
      );
      const referenceDocRefIds = { ...meeting.referenceDocRefIds, ...newRefs };

      // 백엔드 draft-positions는 추가만 하고 교체하지 않으므로, AI 초안(아직 미승인)만 먼저
      // 지운다 — 승인/수정후승인/사용자 추가 안건은 그대로 둔다.
      const staleDrafts = meeting.positions.filter((p) => p.origin === "ai" && p.approvalStatus === "초안");
      await Promise.all(staleDrafts.map((p) => deleteBackendPositionCall(p.id)));

      await generateDraftPositionsOnBackend(meeting.id, project);
      const positions = await fetchAgendaPositions(meeting.id, project);

      updateMeeting(meetingId, (currentMeeting) => ({
        ...currentMeeting,
        selectedDocumentIds,
        referenceDocRefIds,
        positions,
      }));
    },
    [state.meetings, state.projects, updateMeeting]
  );

  const approvePosition = useCallback(
    async (meetingId: string, positionId: string) => {
      const project = state.projects.find(
        (p) => p.id === state.meetings.find((m) => m.id === meetingId)?.projectId
      );
      const body = await postJson<{ position: Record<string, unknown> }>(
        `/api/backend/positions/${positionId}/approve`
      );
      const approved = mapBackendPosition(body.position, project);
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        positions: meeting.positions.map((p) => (p.id === positionId ? approved : p)),
      }));
    },
    [state.meetings, state.projects, updateMeeting]
  );

  const rejectPosition = useCallback(
    async (meetingId: string, positionId: string) => {
      const project = state.projects.find(
        (p) => p.id === state.meetings.find((m) => m.id === meetingId)?.projectId
      );
      const body = await postJson<{ position: Record<string, unknown> }>(
        `/api/backend/positions/${positionId}/reject`
      );
      const rejected = mapBackendPosition(body.position, project);
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        positions: meeting.positions.map((p) => (p.id === positionId ? rejected : p)),
      }));
    },
    [state.meetings, state.projects, updateMeeting]
  );

  const revisePosition = useCallback(
    async (meetingId: string, positionId: string, updates: Partial<Position>) => {
      const project = state.projects.find(
        (p) => p.id === state.meetings.find((m) => m.id === meetingId)?.projectId
      );
      // 백엔드가 수정을 새 버전(새 id)으로 만들기 때문에, 안 넘긴 필드는 이전 값을 그대로
      // 이어받도록 undefined 필드는 아예 안 보낸다.
      const payload: Record<string, unknown> = { approvalStatus: "REVISED_APPROVED" };
      const fieldKeys: (keyof Position)[] = [
        "topic",
        "questionText",
        "answer",
        "preference",
        "concessionRange",
        "dealbreaker",
        "priority",
        "scheduleConstraint",
      ];
      for (const key of fieldKeys) {
        if (updates[key] !== undefined) payload[key] = updates[key];
      }

      const body = await postJson<{ position: Record<string, unknown> }>(
        `/api/backend/positions/${positionId}/revise`,
        payload
      );
      const revised = mapBackendPosition(body.position, project);
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        // revise는 새 id를 발급하므로 옛 버전은 지우고 새 버전을 그 자리에 넣는다.
        positions: [...meeting.positions.filter((p) => p.id !== positionId), revised],
      }));
    },
    [state.meetings, state.projects, updateMeeting]
  );

  const deletePosition = useCallback(
    async (meetingId: string, positionId: string) => {
      await deleteBackendPositionCall(positionId);
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        positions: meeting.positions.filter((p) => p.id !== positionId),
      }));
    },
    [updateMeeting]
  );

  const addUserPosition = useCallback(
    async (
      meetingId: string,
      input: {
        topic: string;
        questionText: string;
        fields: Partial<Record<PositionField, string | number>>;
      }
    ) => {
      const project = state.projects.find(
        (p) => p.id === state.meetings.find((m) => m.id === meetingId)?.projectId
      );
      const created = await postJson<{ position: Record<string, unknown> }>(
        `/api/backend/agendas/${meetingId}/positions`,
        {
          topic: input.topic,
          questionText: input.questionText,
          answer: (input.fields.answer as string) ?? null,
          preference: (input.fields.preference as string) ?? null,
          concessionRange: (input.fields.concessionRange as string) ?? null,
          dealbreaker: (input.fields.dealbreaker as string) ?? null,
          priority: (input.fields.priority as number) ?? null,
          scheduleConstraint: (input.fields.scheduleConstraint as string) ?? null,
        }
      );
      // 예전 mock 동작과 맞춰, 답변 작성자가 직접 추가한 안건은 바로 "승인" 상태로 만든다.
      const approved = await postJson<{ position: Record<string, unknown> }>(
        `/api/backend/positions/${created.position.id}/approve`
      );
      const position = mapBackendPosition(approved.position, project);
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        positions: [...meeting.positions, position],
      }));
    },
    [state.meetings, state.projects, updateMeeting]
  );

  const startLiveMeeting = useCallback(
    (meetingId: string) => {
      // Agora Agent(클라우드에서 직접 우리 서버를 호출)가 "이 회의의 승인된 안건이 뭔지"를
      // 조회할 수 있도록, 미팅 시작 시점의 승인 스냅샷을 서버(임시 메모리 저장소)에 올려둔다.
      // 실패해도 로컬 라이브 전환 자체는 막지 않는다 — mock 데모 단계라 보조 수단일 뿐.
      const currentMeeting = getMeeting(meetingId);
      if (currentMeeting) {
        const approvedSnapshot = buildApprovedSnapshot(currentMeeting.positions).map((p) => ({
          ...p,
          approvalStatus: "승인" as const,
        }));
        fetch("/api/meeting-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId, approvedPositions: approvedSnapshot }),
        }).catch(() => {
          // 서버 스냅샷 업로드 실패는 조용히 무시 (mock 데모 특성상 치명적이지 않음)
        });
      }

      updateMeeting(meetingId, (meeting) => {
        if (meeting.transcript.length > 0) return { ...meeting, status: "라이브" };
        const notice: TranscriptEntry = {
          id: genId("t"),
          speaker: "ai",
          speakerLabel: "AI 진행자",
          timestamp: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
          text:
            "저는 답변 작성자님을 대신해 사전 승인된 범위 안에서 진행합니다. 범위를 벗어나는 " +
            "사안은 보류 후 전달됩니다.",
          translatedText: null,
        };
        return { ...meeting, status: "라이브", transcript: [notice] };
      });
    },
    [getMeeting, updateMeeting]
  );

  const askQuestion = useCallback(
    async (meetingId: string, questionText: string) => {
      const meetingSnapshot = getMeeting(meetingId);
      if (!meetingSnapshot) return;
      const approved = buildApprovedSnapshot(meetingSnapshot.positions);

      // 실제 OpenAI 기반 판단(ai-core/matchIntentOrHold)을 먼저 시도하고,
      // 키가 없거나 호출이 실패하면 mock 휴리스틱으로 폴백해 데모가 끊기지 않게 한다.
      let matchResult: ReturnType<typeof matchMockIntentOrHold>;
      try {
        const res = await fetch("/api/match-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: questionText,
            approvedPositions: approved.map((p) => ({ ...p, approvalStatus: "승인" as const })),
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }
        matchResult = await res.json();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        matchResult = matchMockIntentOrHold(questionText, approved);
        matchResult = {
          ...matchResult,
          intentMatchReasoning: `[실제 AI 호출 실패 → mock 폴백: ${message}] ${matchResult.intentMatchReasoning}`,
        };
      }

      updateMeeting(meetingId, (meeting) => {
        const questionEntry: TranscriptEntry = {
          id: genId("t"),
          speaker: "counterpart",
          speakerLabel: "화자A (상대방)",
          timestamp: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
          text: questionText,
          translatedText: null,
          matchResult,
        };

        const newTranscript = [...meeting.transcript, questionEntry];

        if (matchResult.matched && matchResult.responseText) {
          newTranscript.push({
            id: genId("t"),
            speaker: "ai",
            speakerLabel: "AI 진행자",
            timestamp: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
            text: matchResult.responseText,
            translatedText: null,
          });
        }

        let newHoldItems = meeting.holdItems;
        if (!matchResult.matched) {
          const holdItem: HoldItem = {
            id: genId("hold"),
            meetingId,
            relatedTopic: matchResult.matchedTopic,
            reasonType: "핵심의도불일치",
            reason: matchResult.holdReason ?? "핵심 의도가 일치하는 승인 안건이 없어 보류합니다.",
            transcriptEntryId: questionEntry.id,
            status: "보류",
            followupAnswer: null,
            followupSentAt: null,
            followupDeadline: null,
            reopenCount: 0,
            reopenHistory: [],
          };
          newHoldItems = [...meeting.holdItems, holdItem];
        }

        return recomputeStatus({
          ...meeting,
          transcript: newTranscript,
          holdItems: newHoldItems,
        });
      });
    },
    [getMeeting, updateMeeting]
  );

  const tickNumberConfirmation = useCallback(
    (meetingId: string, transcriptEntryId: string) => {
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        transcript: meeting.transcript.map((t) => {
          if (t.id !== transcriptEntryId || !t.matchResult?.numberConfirmation) return t;
          const nc = t.matchResult.numberConfirmation;
          if (nc.status !== "대기중" || nc.secondsLeft <= 0) return t;
          return {
            ...t,
            matchResult: {
              ...t.matchResult,
              numberConfirmation: { ...nc, secondsLeft: nc.secondsLeft - 1 },
            },
          };
        }),
      }));
    },
    [updateMeeting]
  );

  const resolveNumberConfirmation = useCallback(
    (
      meetingId: string,
      transcriptEntryId: string,
      outcome: Extract<NumberConfirmationStatus, "확인됨" | "거부됨" | "미응답">
    ) => {
      updateMeeting(meetingId, (meeting) => {
        let createdHold: HoldItem | null = null;
        const newTranscript = meeting.transcript.map((t) => {
          if (t.id !== transcriptEntryId || !t.matchResult?.numberConfirmation) return t;
          if (t.matchResult.numberConfirmation.status !== "대기중") return t;

          if (outcome !== "확인됨") {
            createdHold = {
              id: genId("hold"),
              meetingId,
              relatedTopic: t.matchResult.matchedTopic,
              reasonType: outcome === "거부됨" ? "숫자확인거부" : "숫자확인미응답",
              reason:
                outcome === "거부됨"
                  ? `상대방이 "${t.matchResult.responseText}"의 숫자 확인을 거부했습니다.`
                  : `"${t.matchResult.responseText}"의 숫자 확인에 10초 내 응답이 없어 자동 보류됩니다.`,
              transcriptEntryId: t.id,
              status: "보류",
              followupAnswer: null,
              followupSentAt: null,
              followupDeadline: null,
              reopenCount: 0,
              reopenHistory: [],
            };
          }

          return {
            ...t,
            matchResult: {
              ...t.matchResult,
              numberConfirmation: { status: outcome, secondsLeft: 0 },
            },
          };
        });

        const newHoldItems = createdHold ? [...meeting.holdItems, createdHold] : meeting.holdItems;
        return recomputeStatus({ ...meeting, transcript: newTranscript, holdItems: newHoldItems });
      });
    },
    [updateMeeting]
  );

  const submitHoldFollowup = useCallback(
    (meetingId: string, holdItemId: string, answer: string) => {
      updateMeeting(meetingId, (meeting) => {
        const sentAt = new Date().toISOString();
        const newHoldItems = meeting.holdItems.map((h) =>
          h.id === holdItemId
            ? {
                ...h,
                followupAnswer: answer,
                followupSentAt: sentAt,
                followupDeadline: addHours(sentAt, 36), // 24~48시간 사이, 데모는 36h로 고정
                status: "후속답변대기" as const,
              }
            : h
        );
        return recomputeStatus({ ...meeting, holdItems: newHoldItems });
      });
    },
    [updateMeeting]
  );

  const reopenHoldItem = useCallback(
    (meetingId: string, holdItemId: string, note: string) => {
      updateMeeting(meetingId, (meeting) => {
        const newHoldItems = meeting.holdItems.map((h) => {
          if (h.id !== holdItemId) return h;
          const reopenCount = h.reopenCount + 1;
          const reopenHistory = [...h.reopenHistory, { at: new Date().toISOString(), note }];
          if (reopenCount >= MAX_REOPEN_COUNT) {
            return { ...h, reopenCount, reopenHistory, status: "실시간조율필요" as const };
          }
          return {
            ...h,
            reopenCount,
            reopenHistory,
            status: "보류" as const,
            followupAnswer: null,
            followupSentAt: null,
            followupDeadline: null,
          };
        });
        return recomputeStatus({ ...meeting, holdItems: newHoldItems });
      });
    },
    [updateMeeting]
  );

  const confirmHoldItem = useCallback(
    (meetingId: string, holdItemId: string) => {
      updateMeeting(meetingId, (meeting) => {
        const newHoldItems = meeting.holdItems.map((h) =>
          h.id === holdItemId ? { ...h, status: "확정" as const } : h
        );
        return recomputeStatus({ ...meeting, holdItems: newHoldItems });
      });
    },
    [updateMeeting]
  );

  const setTranscriptReviewDecision = useCallback(
    (meetingId: string, transcriptEntryId: string, decision: TranscriptReviewDecision, note: string) => {
      updateMeeting(meetingId, (meeting) => {
        let newHoldItems = meeting.holdItems;
        if (decision === "재보류") {
          const entry = meeting.transcript.find((t) => t.id === transcriptEntryId);
          const reasonType: HoldReasonType = "사후재보류";
          const holdItem: HoldItem = {
            id: genId("hold"),
            meetingId,
            relatedTopic: entry?.matchResult?.matchedTopic ?? null,
            reasonType,
            reason: note || "사후검토 결과 승인 범위를 벗어난 매칭으로 판단되어 재보류합니다.",
            transcriptEntryId,
            status: "보류",
            followupAnswer: null,
            followupSentAt: null,
            followupDeadline: null,
            reopenCount: 0,
            reopenHistory: [],
          };
          newHoldItems = [...meeting.holdItems, holdItem];
        }
        return recomputeStatus({ ...meeting, holdItems: newHoldItems });
      });
    },
    [updateMeeting]
  );

  const confirmMandatoryReviewItem = useCallback(
    (meetingId: string, itemId: string, note: string) => {
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        mandatoryReviewItems: meeting.mandatoryReviewItems.map((item) =>
          item.id === itemId
            ? { ...item, status: "확인후확정" as const, confirmationNote: note }
            : item
        ),
      }));
    },
    [updateMeeting]
  );

  const value: StoreContextValue = {
    projects: state.projects,
    meetings: state.meetings,
    getProject,
    getMeeting,
    getMeetingsByProject,
    createProject,
    deleteProject,
    refreshProjectDocuments,
    refreshProjectMeetings,
    addDocument,
    deleteDocument,
    createMeeting,
    deleteMeeting,
    regenerateDraftPositions,
    approvePosition,
    rejectPosition,
    revisePosition,
    deletePosition,
    addUserPosition,
    startLiveMeeting,
    askQuestion,
    tickNumberConfirmation,
    resolveNumberConfirmation,
    submitHoldFollowup,
    reopenHoldItem,
    confirmHoldItem,
    setTranscriptReviewDecision,
    confirmMandatoryReviewItem,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore는 StoreProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
