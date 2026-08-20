"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  HoldItem,
  HoldReasonType,
  MandatoryReviewItem,
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
 * 클라이언트 사이드 "mock 백엔드". 원래는 실 서버 API가 전혀 없어서 프로젝트/회의/문서를
 * 전부 React Context + localStorage로 들고 있었는데, **프로젝트**는 이제 실제 백엔드가
 * 원본이다 — createProject/deleteProject가 /api/backend/projects를 호출하고, 로그인
 * 사용자가 바뀔 때마다 그 사람의 실제 프로젝트 목록을 가져와 documents/meetingIds(아직
 * 로컬)만 기존 값에서 이어붙여 합친다. 회의/안건/문서는 아직 이 mock 구조 그대로다
 * (진행 중인 마이그레이션 — [[tkzr-scope-decisions]] 참고). 컴포넌트 쪽 훅 사용법
 * (useStore())은 마이그레이션 전후로 그대로 유지되도록 설계했다.
 */

const STORAGE_KEY = "tkzr_store_v1";

interface StoreState {
  projects: Project[];
  meetings: Meeting[];
}

type AiPositionDraft = Omit<Position, "id" | "version" | "origin" | "approvalStatus">;

interface SourceDoc {
  title: string;
  content: string;
  isCoreContext: boolean;
}

/**
 * Git 연동으로 백엔드에 동기화된 문서 하나의 본문을 가져온다. 목록 API(/api/backend/documents)는
 * 무거운 content를 안 주기 때문에, AI 안건 생성 직전에 선택된 문서만 단건으로 가져온다.
 * 실패한 문서는 조용히 제외한다 — 하나가 실패했다고 나머지 문서로 하는 생성 자체를 막을 이유는 없다.
 */
async function fetchBackendDocumentContent(id: string): Promise<SourceDoc | null> {
  try {
    const res = await fetch(`/api/backend/documents/${id}`);
    const body = await res.json();
    if (!res.ok || !body.document) return null;
    return {
      title: body.document.title,
      content: body.document.content ?? "",
      isCoreContext: Boolean(body.document.isCoreContext),
    };
  } catch {
    return null;
  }
}

async function resolveSourceDocs(
  localDocs: SourceDoc[],
  backendDocumentIds: string[]
): Promise<SourceDoc[]> {
  const backendDocs = await Promise.all(backendDocumentIds.map(fetchBackendDocumentContent));
  return [...localDocs, ...backendDocs.filter((d): d is SourceDoc => d !== null)];
}

async function requestDraftPositions(input: {
  documents: Pick<ProjectDocument, "title" | "content" | "isCoreContext">[];
  meetingTitle: string;
  meetingPurpose: string;
  counterpartInfo: string;
}): Promise<AiPositionDraft[]> {
  const response = await fetch("/api/ai/generate-draft-positions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json()) as { positions?: AiPositionDraft[]; error?: string };
  if (!response.ok || !Array.isArray(body.positions)) {
    throw new Error(body.error ?? "AI 안건 생성에 실패했습니다.");
  }

  return body.positions;
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
  addDocument: (projectId: string, doc: Omit<ProjectDocument, "id" | "updatedAt">) => void;
  deleteDocument: (projectId: string, documentId: string) => void;

  createMeeting: (input: {
    projectId: string;
    title: string;
    purpose: string;
    counterpartInfo: string;
    selectedDocumentIds: string[];
    selectedBackendDocumentIds?: string[];
  }) => Promise<Meeting>;
  deleteMeeting: (meetingId: string) => void;
  regenerateDraftPositions: (
    meetingId: string,
    selectedDocumentIds: string[],
    selectedBackendDocumentIds?: string[]
  ) => Promise<void>;

  updatePosition: (meetingId: string, positionId: string, updates: Partial<Position>) => void;
  setPositionApproval: (
    meetingId: string,
    positionId: string,
    status: PositionApprovalStatus
  ) => void;
  addUserPosition: (
    meetingId: string,
    input: {
      topic: string;
      questionText: string;
      fields: Partial<Record<PositionField, string | number>>;
    }
  ) => void;

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

  // 최초 mount 시 localStorage에 저장된 상태가 있으면 그걸로 덮어쓴다 (없으면 seed 유지)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoreState;
        // 예전에 lib/mockSeed.ts가 브라우저에 심어둔 데모 프로젝트("project_dashboard",
        // id가 고정 문자열)가 이미 localStorage에 저장돼 있으면, mock 시드를 지운 뒤에도
        // 계속 남아 보인다 — 여기서 한 번 걸러낸다. 실제로 만든 프로젝트는 genId()가
        // 생성한 다른 형식의 id를 쓰므로 이 필터에 걸리지 않는다.
        parsed.projects = parsed.projects.filter((p) => p.id !== "project_dashboard");
        parsed.meetings = parsed.meetings.filter((m) => m.projectId !== "project_dashboard");
        setState(parsed);
      }
    } catch {
      // 저장된 값이 깨졌으면 seed로 계속 진행
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // 로그인 사용자가 정해지면(또는 바뀌면) 그 사람의 실제 프로젝트 목록을 백엔드에서
  // 가져온다. documents/meetingIds는 아직 로컬(mock)이 원본이라, 같은 id로 이미 로컬에
  // 있던 프로젝트면 그 값을 그대로 이어붙이고 백엔드 목록에 없는 프로젝트(다른 계정의
  // 예전 로컬 데이터 등)는 버린다.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/backend/projects")
      .then((res) => res.json())
      .then((data) => {
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

  const addDocument = useCallback(
    (projectId: string, doc: Omit<ProjectDocument, "id" | "updatedAt">) => {
      const newDoc: ProjectDocument = { ...doc, id: genId("doc"), updatedAt: new Date().toISOString() };
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, documents: [...p.documents, newDoc] } : p
        ),
      }));
    },
    []
  );

  const deleteDocument = useCallback((projectId: string, documentId: string) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId ? { ...p, documents: p.documents.filter((d) => d.id !== documentId) } : p
      ),
    }));
  }, []);

  const createMeeting = useCallback(
    async (input: {
      projectId: string;
      title: string;
      purpose: string;
      counterpartInfo: string;
      selectedDocumentIds: string[];
      /** Git 연동으로 백엔드에 동기화된 문서 중 선택된 것 */
      selectedBackendDocumentIds?: string[];
    }): Promise<Meeting> => {
      const project = state.projects.find((p) => p.id === input.projectId);
      const localDocs = (project?.documents ?? [])
        .filter((d) => input.selectedDocumentIds.includes(d.id))
        .map(({ title, content, isCoreContext }) => ({ title, content, isCoreContext }));
      const documents = await resolveSourceDocs(localDocs, input.selectedBackendDocumentIds ?? []);
      const drafts = await requestDraftPositions({
        documents,
        meetingTitle: input.title,
        meetingPurpose: input.purpose,
        counterpartInfo: input.counterpartInfo,
      });
      const positions: Position[] = drafts.map((draft) => ({
        ...draft,
        id: genId("pos"),
        version: 1,
        origin: "ai",
        approvalStatus: "초안",
      }));

      const meeting: Meeting = {
        id: genId("meeting"),
        projectId: input.projectId,
        title: input.title,
        purpose: input.purpose,
        counterpartInfo: input.counterpartInfo,
        selectedDocumentIds: input.selectedDocumentIds,
        selectedBackendDocumentIds: input.selectedBackendDocumentIds ?? [],
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
    async (
      meetingId: string,
      selectedDocumentIds: string[],
      selectedBackendDocumentIds: string[] = []
    ): Promise<void> => {
      const meeting = state.meetings.find((item) => item.id === meetingId);
      if (!meeting) throw new Error("회의를 찾을 수 없습니다.");

      const project = state.projects.find((item) => item.id === meeting.projectId);
      const localDocs = (project?.documents ?? [])
        .filter((doc) => selectedDocumentIds.includes(doc.id))
        .map(({ title, content, isCoreContext }) => ({ title, content, isCoreContext }));
      const documents = await resolveSourceDocs(localDocs, selectedBackendDocumentIds);
      const drafts = await requestDraftPositions({
        documents,
        meetingTitle: meeting.title,
        meetingPurpose: meeting.purpose,
        counterpartInfo: meeting.counterpartInfo,
      });
      const freshDrafts: Position[] = drafts.map((draft) => ({
        ...draft,
        id: genId("pos"),
        version: 1,
        origin: "ai",
        approvalStatus: "초안",
      }));

      updateMeeting(meetingId, (currentMeeting) => {
        // 이미 승인/수정/사용자 추가된 안건은 유지하고, AI 초안(미승인) 상태였던 것만 새로 교체한다.
        const kept = currentMeeting.positions.filter(
          (p) => p.approvalStatus !== "초안" || p.origin === "user"
        );
        const keptTopics = new Set(kept.map((p) => p.topic));
        const newOnes = freshDrafts.filter((p) => !keptTopics.has(p.topic));
        return {
          ...currentMeeting,
          selectedDocumentIds,
          selectedBackendDocumentIds,
          positions: [...kept, ...newOnes],
        };
      });
    },
    [state.meetings, state.projects, updateMeeting]
  );

  const updatePosition = useCallback(
    (meetingId: string, positionId: string, updates: Partial<Position>) => {
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        positions: meeting.positions.map((p) =>
          p.id === positionId
            ? { ...p, ...updates, version: p.version + (updates.approvalStatus ? 0 : 1) }
            : p
        ),
      }));
    },
    [updateMeeting]
  );

  const setPositionApproval = useCallback(
    (meetingId: string, positionId: string, status: PositionApprovalStatus) => {
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        positions: meeting.positions.map((p) =>
          p.id === positionId ? { ...p, approvalStatus: status } : p
        ),
      }));
    },
    [updateMeeting]
  );

  const addUserPosition = useCallback(
    (
      meetingId: string,
      input: {
        topic: string;
        questionText: string;
        fields: Partial<Record<PositionField, string | number>>;
      }
    ) => {
      const activeFields = Object.keys(input.fields) as PositionField[];
      const position: Position = {
        id: genId("pos"),
        topic: input.topic,
        version: 1,
        origin: "user",
        approvalStatus: "승인",
        questionText: input.questionText,
        answer: (input.fields.answer as string) ?? null,
        preference: (input.fields.preference as string) ?? null,
        concessionRange: (input.fields.concessionRange as string) ?? null,
        dealbreaker: (input.fields.dealbreaker as string) ?? null,
        priority: (input.fields.priority as number) ?? null,
        scheduleConstraint: (input.fields.scheduleConstraint as string) ?? null,
        activeFields,
        confidenceLevel: "문서근거명확",
        sourceDocumentTitle: null,
        reasoning: "답변 작성자가 직접 추가한 안건 (AI가 예상하지 못한 질문 보완용).",
      };
      updateMeeting(meetingId, (meeting) => ({
        ...meeting,
        positions: [...meeting.positions, position],
      }));
    },
    [updateMeeting]
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
    addDocument,
    deleteDocument,
    createMeeting,
    deleteMeeting,
    regenerateDraftPositions,
    updatePosition,
    setPositionApproval,
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
