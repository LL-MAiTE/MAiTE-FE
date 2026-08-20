/**
 * 서버 전용. 백엔드(Spring Boot, LL-MAiTE/MAiTE-BE)의 REST API를 직접 호출하는 얇은 클라이언트.
 *
 * 모든 호출은 "누구 대신 부르는지"를 나타내는 사용자 JWT를 첫 인자(token)로 받는다.
 * 이 토큰은 lib/session.ts의 httpOnly 쿠키(tkzr_session)에서 나온 실제 로그인 사용자의
 * 토큰이다 — 예전엔 고정 서비스 계정 토큰(BACKEND_API_TOKEN) 하나로 모든 호출을
 * 보냈는데, 그러면 로그인한 사람과 무관하게 항상 같은 계정의 데이터만 보이게 된다
 * (GET /projects 같은 "내 것만" 엔드포인트가 무의미해짐). 호출부(app/api/backend/*
 * 라우트 핸들러)가 `requireSessionToken()`으로 꺼낸 값을 여기로 그대로 전달한다.
 *
 * 프로젝트/회의 준비(Agenda·Position) CRUD는 여전히 프론트 mock(localStorage)이 원본이다 —
 * 라이브 미팅을 실제로 시작할 때만, 그 시점의 로컬 데이터를 백엔드에 "동기화"해서
 * Agora Conversational AI(백엔드가 소유)가 실제 DB 데이터를 보고 응답하게 만든다.
 * (프로젝트 CRUD를 백엔드로 옮기는 작업은 [[tkzr-scope-decisions]] 참고 — 진행 중)
 */

interface BackendEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}가 서버에 설정되어 있지 않습니다 (frontend/.env.local 확인).`);
  return value;
}

async function backendFetch<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const baseUrl = requireEnv("BACKEND_BASE_URL").replace(/\/$/, "");

  const res = await fetch(`${baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const body: BackendEnvelope<T> = await res.json().catch(() => ({ success: false }));
  if (!res.ok || !body.success) {
    throw new Error(body.message ?? `백엔드 호출 실패 (HTTP ${res.status}): ${path}`);
  }
  // 일부 엔드포인트(예: /meetings/:id/end)는 data 없이 { success: true }만 내려준다.
  // data가 필요한 호출부는 각자 결과를 검증해서 쓴다.
  return (body.data ?? body) as T;
}

// ---------------------------------------------------------------------------
// Agenda(=프론트의 "회의 준비") + Position(=안건)
// ---------------------------------------------------------------------------

export interface BackendProject {
  id: string;
  name: string;
}

export async function createBackendProject(token: string, name: string): Promise<BackendProject> {
  return backendFetch<BackendProject>(token, "/projects", { method: "POST", body: { name } });
}

/**
 * 로컬(mock) 프로젝트에 대응하는 백엔드 실 프로젝트를 보장한다 — 이미 링크돼 있으면
 * 그대로 재사용하고, 없으면 지금 만들고 링크를 저장한다. sync-meeting/project-members/
 * git-sync 세 경로가 전부 이 함수 하나를 공유해서 중복 생성을 막는다.
 */
export async function ensureBackendProjectId(
  token: string,
  localProjectId: string,
  projectName: string
): Promise<string> {
  const { getBackendProjectId, saveBackendProjectId } = await import("./backendMeetingLinkStore");
  const existing = getBackendProjectId(localProjectId);
  if (existing) return existing;
  const project = await createBackendProject(token, projectName);
  saveBackendProjectId(localProjectId, project.id);
  return project.id;
}

export interface BackendAgenda {
  id: string;
  projectId: string;
  title: string;
  status: string;
}

export async function createBackendAgenda(
  token: string,
  input: {
    projectId: string;
    title: string;
    purpose: string;
    counterpartInfo: string;
  }
): Promise<BackendAgenda> {
  return backendFetch<BackendAgenda>(token, "/agendas", {
    method: "POST",
    body: {
      projectId: input.projectId,
      title: input.title,
      purpose: input.purpose,
      // 프론트는 아직 국가/언어를 분리 입력받지 않아서, 자유 텍스트를 그대로 넣는다 (손실 있는 매핑).
      counterpartCountry: input.counterpartInfo,
      counterpartLanguage: "ko-KR",
      transcriptLanguages: ["ko-KR"],
    },
  });
}

export interface BackendPosition {
  id: string;
  topic: string;
}

export async function addAndApproveBackendPosition(
  token: string,
  agendaId: string,
  position: {
    topic: string;
    questionText: string;
    answer: string | null;
    preference: string | null;
    concessionRange: string | null;
    dealbreaker: string | null;
    priority: number | null;
    scheduleConstraint: string | null;
  }
): Promise<BackendPosition> {
  const created = await backendFetch<BackendPosition>(token, `/agendas/${agendaId}/positions`, {
    method: "POST",
    body: position,
  });
  return backendFetch<BackendPosition>(token, `/positions/${created.id}/approve`, {
    method: "POST",
    body: { approvalStatus: "APPROVED" },
  });
}

// ---------------------------------------------------------------------------
// Meeting(=프론트의 "라이브 세션")
// ---------------------------------------------------------------------------

export interface BackendMeeting {
  id: string;
  agendaId: string;
  status: string;
}

export async function createBackendMeeting(token: string, agendaId: string): Promise<BackendMeeting> {
  return backendFetch<BackendMeeting>(token, `/agendas/${agendaId}/meetings`, { method: "POST" });
}

export interface BackendMeetingStartResult {
  disclosureCompletedAt: string;
  agoraAppId: string;
  agoraChannel: string;
  agoraToken: string;
  // 사람 참여자가 join할 때 반드시 이 uid를 써야 한다 — 아바타 모드에서는 백엔드가
  // remote_rtc_uids에 이 값 하나만 명시해두기 때문에(Agora가 "*" 전체구독을 거부함),
  // 다른 uid로 join하면 에이전트가 사람 음성을 구독하지 못한다.
  agoraUid: number;
  agoraAgentUid: number;
}

export async function startBackendMeeting(
  token: string,
  meetingId: string
): Promise<BackendMeetingStartResult> {
  return backendFetch<BackendMeetingStartResult>(token, `/meetings/${meetingId}/start`, { method: "POST" });
}

export async function endBackendMeeting(token: string, meetingId: string): Promise<void> {
  await backendFetch<{ success: boolean }>(token, `/meetings/${meetingId}/end`, { method: "POST" });
}

export interface BackendTranscript {
  id: string;
  meetingId: string;
  speakerLabel: string; // "USER" | "AI_AGENT" (백엔드가 Agora 콜백으로 저장한 원문)
  language: string;
  text: string;
  spokenAt: string;
  confidence: number | null;
}

/**
 * 백엔드가 Agora message_subscriber 콜백(/agora/callback → saveConversationTurn)으로
 * 실시간 저장해둔 원문 대화(양쪽 발화)를 가져온다. 라이브 화면이 3초 간격으로 폴링해서
 * "실시간 대화" 패널에 실제 음성 협상 내용을 보여주는 데 쓴다.
 */
export async function getBackendTranscripts(token: string, meetingId: string): Promise<BackendTranscript[]> {
  return backendFetch<BackendTranscript[]>(token, `/meetings/${meetingId}/transcripts`);
}

// ---------------------------------------------------------------------------
// 알림
// ---------------------------------------------------------------------------

export interface BackendNotification {
  id: string;
  type: string;
  referenceId: string;
  referenceType: string;
  isRead: boolean;
  createdAt: string;
}

export async function listBackendNotifications(token: string): Promise<BackendNotification[]> {
  return backendFetch<BackendNotification[]>(token, "/notifications");
}

export async function markBackendNotificationRead(token: string, id: string): Promise<void> {
  await backendFetch(token, `/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllBackendNotificationsRead(token: string): Promise<void> {
  await backendFetch(token, "/notifications/read-all", { method: "PATCH" });
}

// ---------------------------------------------------------------------------
// 프로젝트 멤버
// ---------------------------------------------------------------------------

export interface BackendUser {
  id: string;
  email: string;
  name: string;
}

/** 이메일로 사용자를 찾는다 — 상대가 백엔드에 이미 회원가입돼 있어야 한다(초대 전에
 * 미리 회원가입해두라고 안내해야 함). 없으면 null. */
export async function searchBackendUserByEmail(token: string, email: string): Promise<BackendUser | null> {
  try {
    return await backendFetch<BackendUser>(token, `/users?email=${encodeURIComponent(email)}`);
  } catch {
    return null;
  }
}

export interface BackendProjectMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
}

export async function listBackendProjectMembers(
  token: string,
  backendProjectId: string
): Promise<BackendProjectMember[]> {
  return backendFetch<BackendProjectMember[]>(token, `/projects/${backendProjectId}/members`);
}

export async function inviteBackendProjectMember(
  token: string,
  backendProjectId: string,
  userId: string,
  role: "ANSWERER" | "QUESTIONER" | "TEAM_MANAGER"
): Promise<BackendProjectMember> {
  return backendFetch<BackendProjectMember>(token, `/projects/${backendProjectId}/members`, {
    method: "POST",
    body: { userId, role },
  });
}

// ---------------------------------------------------------------------------
// 문서 소스 연동 (Git)
// ---------------------------------------------------------------------------

export interface BackendConnection {
  id: string;
  type: string;
  workspaceOrRepoName: string;
}

export async function createBackendConnection(
  token: string,
  backendProjectId: string,
  repo: string,
  accessToken: string
): Promise<BackendConnection> {
  return backendFetch<BackendConnection>(token, `/projects/${backendProjectId}/connections`, {
    method: "POST",
    body: { type: "GIT", workspaceOrRepoName: repo, accessToken },
  });
}

export interface BackendSyncResult {
  syncedCount: number;
  latestFiles: string[];
}

export async function syncBackendConnection(token: string, connectionId: string): Promise<BackendSyncResult> {
  return backendFetch<BackendSyncResult>(token, `/connections/${connectionId}/sync`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// 문서 (Git/Notion 동기화 결과 조회·삭제) — 백엔드에 단건 조회/삭제 API가
// 새로 생겨서(GET·DELETE /documents/:id) 연결한다. 목록 API는 무거운 content를
// 안 주기 때문에, 본문은 클릭 시점에 단건 조회로 따로 받아온다.
// ---------------------------------------------------------------------------

export interface BackendDocument {
  id: string;
  title: string;
  path: string | null;
  isCoreContext: boolean;
  syncedAt: string | null;
}

export async function listBackendDocuments(
  token: string,
  backendProjectId: string
): Promise<BackendDocument[]> {
  return backendFetch<BackendDocument[]>(token, `/projects/${backendProjectId}/documents`);
}

export interface BackendDocumentDetail extends BackendDocument {
  content: string | null;
}

export async function getBackendDocument(token: string, documentId: string): Promise<BackendDocumentDetail> {
  return backendFetch<BackendDocumentDetail>(token, `/documents/${documentId}`);
}

/** 안건의 참조 문서로 이미 쓰이고 있으면 백엔드가 409(DOCUMENT_IN_USE)로 거부한다 —
 * backendFetch가 이 경우 message를 그대로 Error로 던지므로 호출부에서 안내하면 된다. */
export async function deleteBackendDocument(token: string, documentId: string): Promise<void> {
  await backendFetch(token, `/documents/${documentId}`, { method: "DELETE" });
}
