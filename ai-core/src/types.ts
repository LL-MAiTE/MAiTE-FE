/**
 * 특기전력 AI 핵심 로직에서 공용으로 쓰이는 타입 정의.
 */

/** 답변 작성자가 업로드/선택한 참고 문서 */
export interface SourceDocument {
  title: string;
  content: string;
  /** true면 "프로젝트 핵심 맥락 md" — 큰 틀(팀 구성, 목적 등)만 참고하고, 구체적 답변 근거로는 쓰지 않는다 */
  isCoreContext: boolean;
}

/** 안건(포지션) 하나에서 실제로 채울 수 있는 필드 이름 */
export type PositionField =
  | "answer"
  | "preference"
  | "concessionRange"
  | "dealbreaker"
  | "priority"
  | "scheduleConstraint";

export type ConfidenceLevel = "문서근거명확" | "추정";

/** generateDraftPositions의 출력 원소 = 안건 초안 하나 */
export interface PositionDraft {
  /** 주제 (버전관리용 식별자, 예: "api_deadline") */
  topic: string;
  /** 예상 질문 (예: "API 마감일을 앞당길 수 있나요?") */
  questionText: string;
  answer: string | null;
  /** 선호안 */
  preference: string | null;
  /** 양보 가능 범위 */
  concessionRange: string | null;
  /** 양보 불가 사항 */
  dealbreaker: string | null;
  priority: number | null;
  scheduleConstraint: string | null;
  /** 이 안건에서 실제로 채운 필드 목록 */
  activeFields: PositionField[];
  confidenceLevel: ConfidenceLevel;
  /** 어떤 문서를 근거로 했는지 */
  sourceDocumentTitle: string | null;
  /** 왜 이 필드들만 채웠는지 짧은 설명 (디버깅/검증용) */
  reasoning: string;
}

/** 승인 상태가 붙은 안건 (matchIntentOrHold의 입력) */
export interface ApprovedPosition extends PositionDraft {
  approvalStatus: "승인";
}

/** generateDraftPositions 입력 */
export interface GenerateDraftPositionsInput {
  documents: SourceDocument[];
  meetingTitle: string;
  meetingPurpose: string;
  /** 상대방 정보 (국가, 언어, 소속 등 자유 텍스트) */
  counterpartInfo: string;
}

/** matchIntentOrHold 출력 */
export interface MatchResult {
  matched: boolean;
  /** 매칭된 안건의 topic */
  matchedTopic: string | null;
  /** 왜 일치/불일치라고 판단했는지 */
  intentMatchReasoning: string;
  /** matched=true일 때, 상대방에게 전달할 답변 */
  responseText: string | null;
  /** 응답에 날짜/금액/수량 등 핵심 수치가 포함되는지 */
  containsCriticalNumber: boolean;
  /** 세부 조건이 다를 경우 함께 전달할 제한사항 */
  limitationNote: string | null;
  /** matched=false일 때, 보류 사유 */
  holdReason: string | null;
}

/** matchIntentOrHold 입력 */
export interface MatchIntentOrHoldInput {
  question: string;
  approvedPositions: ApprovedPosition[];
}
