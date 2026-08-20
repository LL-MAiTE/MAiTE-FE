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
 * 프로젝트(생성/조회/삭제)는 이제 이 백엔드가 원본이다 — project.id는 항상 백엔드가 발급한
 * 실제 UUID를 그대로 쓴다(예전엔 로컬 mock id와 백엔드 id가 달라서 별도 매핑 파일이
 * 필요했는데, 프로젝트 레벨에서는 이제 그 매핑이 필요 없다).
 *
 * 회의 준비(Agenda·Position)는 아직 프론트 mock(localStorage)이 원본이다 — 라이브 미팅을
 * 실제로 시작할 때만, 그 시점의 로컬 데이터를 백엔드에 "동기화"해서 Agora Conversational
 * AI(백엔드가 소유)가 실제 DB 데이터를 보고 응답하게 만든다. 이 부분의 로컬↔백엔드 id
 * 매핑(lib/backendMeetingLinkStore.ts의 MEETING_STORE_FILE)은 여전히 필요하다.
 * (전체 마이그레이션 진행 상황은 [[tkzr-scope-decisions]] 참고)
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
  description: string | null;
  createdAt: string;
}

/** 로그인한 사용자가 멤버로 속한 프로젝트만 돌아온다(백엔드가 JWT로 필터링). */
export async function listBackendProjects(token: string): Promise<BackendProject[]> {
  return backendFetch<BackendProject[]>(token, "/projects");
}

export async function createBackendProject(
  token: string,
  name: string,
  description: string
): Promise<BackendProject> {
  return backendFetch<BackendProject>(token, "/projects", {
    method: "POST",
    body: { name, description },
  });
}

/** agenda(회의 준비)가 하나라도 있으면 백엔드가 409(PROJECT_HAS_AGENDAS)로 거부한다. */
export async function deleteBackendProject(token: string, projectId: string): Promise<void> {
  await backendFetch(token, `/projects/${projectId}`, { method: "DELETE" });
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
    /** BCP-47 언어 코드(예: "en-US"). 라이브 통화의 ASR/TTS/LLM 응답 언어를 정하는 데
     * 쓰인다 — 예전엔 여기가 항상 "ko-KR"로 고정돼 있어서, 위저드에서 "영어"를 골라도
     * 실제 통화는 한국어로 진행되는 버그가 있었다(실사용 중 발견). */
    counterpartLanguageCode?: string;
  }
): Promise<BackendAgenda> {
  const language = input.counterpartLanguageCode ?? "ko-KR";
  return backendFetch<BackendAgenda>(token, "/agendas", {
    method: "POST",
    body: {
      projectId: input.projectId,
      title: input.title,
      purpose: input.purpose,
      // 프론트는 아직 국가/언어를 분리 입력받지 않아서, 자유 텍스트를 그대로 넣는다 (손실 있는 매핑).
      counterpartCountry: input.counterpartInfo,
      counterpartLanguage: language,
      transcriptLanguages: [language],
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
// 문서 — 수동 업로드든 Git/Notion 연동이든 전부 이 API 하나로 다룬다(source_document가
// 원본). 목록 API는 무거운 content를 안 주기 때문에, 본문은 필요할 때 단건 조회로 따로
// 받아온다(getBackendDocument).
// ---------------------------------------------------------------------------

export interface BackendDocument {
  id: string;
  title: string;
  path: string | null;
  isCoreContext: boolean;
  syncedAt: string | null;
  lastModifiedAt: string | null;
}

export async function listBackendDocuments(
  token: string,
  backendProjectId: string
): Promise<BackendDocument[]> {
  return backendFetch<BackendDocument[]>(token, `/projects/${backendProjectId}/documents`);
}

/** 프로젝트 화면에서 직접 붙여넣은 문서를 업로드한다. isCoreContext는 업로드 API에
 * 없어서(백엔드 UploadDocumentRequest가 title/content만 받음), 필요하면 업로드 직후
 * updateBackendDocument로 한 번 더 반영한다. */
export async function uploadBackendDocument(
  token: string,
  backendProjectId: string,
  title: string,
  content: string
): Promise<BackendDocument> {
  return backendFetch<BackendDocument>(token, `/projects/${backendProjectId}/documents`, {
    method: "POST",
    body: { title, content },
  });
}

export async function updateBackendDocument(
  token: string,
  documentId: string,
  isCoreContext: boolean
): Promise<BackendDocument> {
  return backendFetch<BackendDocument>(token, `/documents/${documentId}`, {
    method: "PATCH",
    body: { isCoreContext },
  });
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

// ---------------------------------------------------------------------------
// 결과 검토 — 보류함 / 대화별 검토 / 필수검토
//
// "결과 검토" 화면(review/page.tsx)이 지금까지 프론트 로컬(mock) meeting.holdItems /
// meeting.transcript만 보고 있어서, 실제 라이브 통화 중 쌓인 진짜 보류 항목이 화면에
// 하나도 안 보이는 문제가 있었다 — 이 섹션이 그 실제 데이터를 붙이는 함수들이다.
// backendMeetingId는 lib/backendMeetingLinkStore.ts로 조회한다(라이브를 한 번도 시작
// 안 한 미팅은 링크가 없어서, 호출부가 이 경우 기존 로컬 mock 표시로 폴백해야 한다).
// ---------------------------------------------------------------------------

export interface BackendHoldItem {
  id: string;
  meetingId: string;
  meetingLogId: string | null;
  origin: "DURING_MEETING" | "POST_RE_HOLD";
  reason: string | null;
  status:
    | "UNRESOLVED"
    | "AWAITING_ANSWER"
    | "CONFIRMED_IMMEDIATE"
    | "CONFIRMED_TIMEOUT"
    | "REOPENED"
    | "NEEDS_REALTIME";
  answerText: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  deliveredToCounterpartAt: string | null;
  reopenCount: number;
  resolvedAt: string | null;
  createdAt: string;
}

export async function listBackendHoldItems(token: string, backendMeetingId: string): Promise<BackendHoldItem[]> {
  return backendFetch<BackendHoldItem[]>(token, `/meetings/${backendMeetingId}/hold-items`);
}

export async function answerBackendHoldItem(
  token: string,
  holdItemId: string,
  answerText: string
): Promise<BackendHoldItem> {
  return backendFetch<BackendHoldItem>(token, `/hold-items/${holdItemId}/answer`, {
    method: "POST",
    body: { answerText },
  });
}

/** 최대 2회 — 상한 초과 시 백엔드가 REOPEN_LIMIT_EXCEEDED로 거부한다(호출부는 UI에서
 * reopenCount로 미리 막아두지만, 이중 안전장치로 에러 메시지를 그대로 보여주면 된다). */
export async function reopenBackendHoldItem(token: string, holdItemId: string): Promise<BackendHoldItem> {
  return backendFetch<BackendHoldItem>(token, `/hold-items/${holdItemId}/reopen`, { method: "POST" });
}

/** 타임아웃 확정은 원래 15분마다 도는 스케줄러가 24시간 뒤 자동으로 처리하지만, 데모/
 * 테스트 중 "지금 바로 확정 처리"를 시뮬레이션하려고 이 배치용 PATCH를 수동으로도 쓴다. */
export async function updateBackendHoldItemStatus(
  token: string,
  holdItemId: string,
  status: "CONFIRMED_TIMEOUT" | "NEEDS_REALTIME"
): Promise<BackendHoldItem> {
  return backendFetch<BackendHoldItem>(token, `/hold-items/${holdItemId}`, {
    method: "PATCH",
    body: { status },
  });
}

export interface BackendMeetingLog {
  id: string;
  meetingId: string;
  transcriptId: string;
  matchedMeetingPositionId: string | null;
  /** AI가 실제로 답한(또는 보류 판단한) 원문 */
  translatedText: string | null;
  translatedCaption: string | null;
  containsCriticalNumber: boolean;
  limitationNote: string | null;
  deliveredAt: string | null;
  status: "PENDING" | "DELIVERED" | "ON_HOLD";
}

export async function listBackendMeetingLogs(token: string, backendMeetingId: string): Promise<BackendMeetingLog[]> {
  return backendFetch<BackendMeetingLog[]>(token, `/meetings/${backendMeetingId}/meeting-logs`);
}

export interface BackendReviewAction {
  id: string;
  meetingLogId: string;
  reviewerId: string;
  action: "APPROVED" | "REVISED" | "WITHDRAWN" | "RE_HELD";
  resultingHoldItemId: string | null;
  note: string | null;
  createdAt: string;
}

/** RE_HELD를 고르면 백엔드가 새 hold_item을 자동 생성한다(응답의 resultingHoldItemId) —
 * 호출부가 이후 보류함 목록을 다시 불러오면 그 항목이 나타난다. */
export async function createBackendReviewAction(
  token: string,
  meetingLogId: string,
  action: "APPROVED" | "REVISED" | "WITHDRAWN" | "RE_HELD",
  note?: string
): Promise<BackendReviewAction> {
  return backendFetch<BackendReviewAction>(token, `/meeting-logs/${meetingLogId}/review-actions`, {
    method: "POST",
    body: { action, note },
  });
}

export interface BackendRequiredReview {
  id: string;
  meetingLogId: string;
  designatedBy: string;
  designatedAt: string;
  status: "CONDITIONAL" | "CONFIRMED" | "REVISED" | "WITHDRAWN";
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export async function listBackendRequiredReviews(
  token: string,
  backendMeetingId: string
): Promise<BackendRequiredReview[]> {
  return backendFetch<BackendRequiredReview[]>(token, `/meetings/${backendMeetingId}/required-reviews`);
}

export async function confirmBackendRequiredReview(
  token: string,
  requiredReviewId: string
): Promise<BackendRequiredReview> {
  return backendFetch<BackendRequiredReview>(token, `/required-reviews/${requiredReviewId}`, { method: "PATCH" });
}
