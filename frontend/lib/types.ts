/**
 * 특기전력 프론트엔드 공용 타입.
 * 기능 명세서(2026-08-14 최종본)의 용어를 그대로 따른다:
 *   프로젝트(문서 누적 단위) > 회의(이름+목적+선택 문서로 생성) > 안건(회의 하나에 속한 예상 질문-답변 단위)
 *
 * 지금은 mock 데이터 기반 스캐폴드다. 실제 백엔드가 붙으면 lib/store.tsx의
 * "mock 백엔드" 부분만 실제 API 호출로 교체하면 되도록 타입/함수 시그니처를 맞춰뒀다.
 */

// ---------------------------------------------------------------------------
// 기능 1: 프로젝트 문서
// ---------------------------------------------------------------------------

export interface ProjectDocument {
  id: string;
  title: string;
  content: string;
  /** true면 "프로젝트 핵심 맥락 md" — 회의 생성 시 파일 선택 목록에 항상 우선 노출, AI 생성 시 항상 참고 */
  isCoreContext: boolean;
  updatedAt: string; // ISO date
}

export interface Project {
  id: string;
  name: string;
  description: string;
  documents: ProjectDocument[];
  meetingIds: string[];
}

// ---------------------------------------------------------------------------
// 기능 2·3: 회의 + 안건 (버전 관리 포함)
// ---------------------------------------------------------------------------

export type PositionField =
  | "answer"
  | "preference"
  | "concessionRange"
  | "dealbreaker"
  | "priority"
  | "scheduleConstraint";

export type ConfidenceLevel = "문서근거명확" | "추정";

export type PositionApprovalStatus =
  | "초안" // AI가 막 생성했거나 사용자가 방금 추가, 아직 승인/반려 안 됨
  | "승인"
  | "수정후승인"
  | "반려"
  | "삭제됨"; // 버전 생성 없이 삭제됨 상태로 전환, 매칭 대상에서 제외

export type PositionOrigin = "ai" | "user";

/** 안건(항목) 하나. topic 단위로 버전이 붙는다 (v1, v2, ...). */
export interface Position {
  id: string;
  topic: string; // 버전관리용 식별자, 예: "api_deadline"
  version: number; // v1부터 시작. 수정되면 새 버전, 안 건드리면 carry-over(버전 그대로)
  origin: PositionOrigin;
  approvalStatus: PositionApprovalStatus;

  questionText: string;
  answer: string | null;
  preference: string | null;
  concessionRange: string | null;
  dealbreaker: string | null;
  priority: number | null;
  scheduleConstraint: string | null;
  activeFields: PositionField[]; // 실제로 값을 채운 필드만

  confidenceLevel: ConfidenceLevel;
  sourceDocumentTitle: string | null;
  reasoning: string; // 디버깅/검증용, UI에 항상 노출하지 않아도 됨
}

export type MeetingStatus =
  | "준비중" // 파일 선택 + AI 초안 생성 단계
  | "승인대기" // 안건 검토/승인 중
  | "라이브" // 실시간 음성 미팅 진행 중
  | "후속답변대기" // 보류 항목이 남아 비동기로 이어지는 중
  | "종료"; // 모든 보류 항목이 종결됨

export interface Meeting {
  id: string;
  projectId: string;
  title: string;
  purpose: string;
  counterpartInfo: string; // 국가/언어/소속 등 자유 텍스트
  selectedDocumentIds: string[]; // 회의 생성 시 필수로 최소 1개 선택
  status: MeetingStatus;
  positions: Position[];
  transcript: TranscriptEntry[];
  holdItems: HoldItem[];
  mandatoryReviewItems: MandatoryReviewItem[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 기능 4·5·6: 실시간 미팅 (STT, 고지, 통역 전달, 숫자 확인)
// ---------------------------------------------------------------------------

export type Speaker = "counterpart" | "ai" | "host";

export interface TranscriptEntry {
  id: string;
  speaker: Speaker;
  speakerLabel: string; // 예: "화자A", "화자B(AI)"
  timestamp: string; // HH:mm:ss
  text: string;
  translatedText: string | null;
  /** 이 발화가 안건 매칭 시도의 대상(질문)이었다면, 매칭 결과 참조 */
  matchResult?: MatchResult;
}

export interface MatchResult {
  matched: boolean;
  matchedTopic: string | null;
  intentMatchReasoning: string;
  responseText: string | null;
  containsCriticalNumber: boolean;
  limitationNote: string | null;
  holdReason: string | null;
  /** 숫자 확인 팝업 상태 (containsCriticalNumber=true일 때만 의미 있음) */
  numberConfirmation?: NumberConfirmationState;
}

export type NumberConfirmationStatus =
  | "대기중" // 팝업 노출, 10초 카운트다운 중
  | "확인됨" // 상대방이 O 선택 → 전달 확정
  | "거부됨" // 상대방이 X 선택 → 자동 보류
  | "미응답"; // 10초 내 미응답 → 자동 보류

export interface NumberConfirmationState {
  status: NumberConfirmationStatus;
  secondsLeft: number; // 데모용 카운트다운 (10초에서 시작)
}

// ---------------------------------------------------------------------------
// 기능 7: 승인 범위 내 대안 조율
// ---------------------------------------------------------------------------

export interface AlternativeProposal {
  id: string;
  topic: string; // 관련 안건 topic
  proposedByCounterpart: string; // 상대방이 제안한 대안 (자유 텍스트, 예: "납기 9/1")
  withinApprovedRange: boolean | null; // null이면 아직 판단 전
  note: string | null;
}

// ---------------------------------------------------------------------------
// 기능 8·8-1: 보류 항목 비동기 후속 처리 + 사후 재보류
// ---------------------------------------------------------------------------

export type HoldReasonType = "핵심의도불일치" | "숫자확인미응답" | "숫자확인거부" | "사후재보류";

export type HoldItemStatus =
  | "보류" // 아직 답변 작성자 후속답변 없음
  | "후속답변대기" // 답변 작성자가 답변, 상대방에게 전달됨, 24~48h 타임아웃 대기 중
  | "확정" // 만족(재오픈 없음) 또는 타임아웃으로 확정
  | "실시간조율필요"; // 재오픈 상한(2회) 도달로 종결

export const MAX_REOPEN_COUNT = 2;
export const FOLLOWUP_TIMEOUT_HOURS = { min: 24, max: 48 } as const;
export const NUMBER_CONFIRMATION_TIMEOUT_SECONDS = 10;

export interface HoldItem {
  id: string;
  meetingId: string;
  relatedTopic: string | null;
  reasonType: HoldReasonType;
  reason: string;
  transcriptEntryId: string | null; // 관련 대화 구간 (음성 재생용, mock)
  status: HoldItemStatus;
  followupAnswer: string | null; // 답변 작성자가 작성한 후속 답변
  followupSentAt: string | null;
  followupDeadline: string | null; // followupSentAt + 24~48h
  reopenCount: number; // 0~2, 상한 도달 시 실시간조율필요로 종결
  reopenHistory: { at: string; note: string }[];
}

// ---------------------------------------------------------------------------
// 기능 9: 대화별 회의 결과 검토
// ---------------------------------------------------------------------------

export type TranscriptReviewDecision = "미검토" | "승인" | "수정" | "철회" | "재보류";

export interface TranscriptReview {
  transcriptEntryId: string;
  decision: TranscriptReviewDecision;
  note: string | null;
}

// ---------------------------------------------------------------------------
// 기능 10: 필수 검토 항목 관리
// ---------------------------------------------------------------------------

export type MandatoryReviewStatus = "확인전" | "확인후확정";

export interface MandatoryReviewItem {
  id: string;
  meetingId: string;
  relatedTopic: string | null;
  label: string; // 예: "계약기간 연장"
  requestedByCounterpart: boolean; // 상대방이 필수 검토로 지정했는지
  status: MandatoryReviewStatus;
  confirmationNote: string | null;
}
