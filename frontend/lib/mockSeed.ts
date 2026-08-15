import {
  HoldItem,
  MandatoryReviewItem,
  Meeting,
  Position,
  Project,
  TranscriptEntry,
} from "./types";

/**
 * 데모/개발용 mock 시드 데이터.
 *
 * 문서 3개와 "API 마감일" 관련 안건은 ../ai-core/test-scenario.ts에서 이미 검증한
 * 시나리오와 동일하게 맞춰뒀다 — AI 로직 프로토타입 결과를 프론트 화면에서 그대로
 * 이어볼 수 있게 하기 위함. 실제 백엔드가 붙으면 이 파일은 지우고
 * lib/store.tsx의 fetch 함수들만 실제 API 호출로 교체하면 된다.
 */

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// 프로젝트 1: 대시보드 API 프로젝트 (ai-core 테스트 시나리오와 동일한 문서)
// ---------------------------------------------------------------------------

const projectOverviewDoc = {
  id: "doc_overview",
  title: "project-overview.md",
  isCoreContext: true,
  updatedAt: "2026-07-20T09:00:00+09:00",
  content:
    "본 프로젝트는 한국 팀(PM: 재현)과 미국 개발팀(리드: 사라)이 공동 진행하는 " +
    "B2B SaaS 대시보드 개발 프로젝트입니다. 두 팀은 13시간 시차가 있어 실시간 회의를 " +
    "잡기 어렵습니다. 현재 스프린트 목표는 API 1차 버전 완성입니다.",
};

const scheduleAgreementDoc = {
  id: "doc_schedule",
  title: "schedule-agreement.md",
  isCoreContext: false,
  updatedAt: "2026-08-05T14:30:00+09:00",
  content:
    "API 개발 마감일은 8월 25일로 합의되었습니다. 내부적으로는 상황에 따라 8월 28일까지는 " +
    "여유가 있다고 판단하고 있으나, 이 여유분은 외부에 먼저 공개하지 않고 협상 카드로 " +
    "남겨둘 것. 8월 28일을 넘기는 것은 불가합니다 (다음 마일스톤 일정과 직결).",
};

const sprintNotesDoc = {
  id: "doc_sprint_notes",
  title: "sprint-notes-0728.md",
  isCoreContext: false,
  updatedAt: "2026-07-28T18:00:00+09:00",
  content:
    "7/28 스프린트 회의 메모: QA 인력 관련 논의 없었음. 계약 기간 연장 관련 논의도 없었음. " +
    "현재 스코프는 API 개발까지만 포함, 계약서상 명시된 협업 기간은 별도 계약 문서를 " +
    "따름 (이 문서엔 구체적 언급 없음).",
};

// --- 회의 1: "API 마감일 협의" — 승인대기 (안건 승인 화면 데모) ------------------

const deadlinePosition: Position = {
  id: "pos_api_deadline",
  topic: "api_deadline",
  version: 1,
  origin: "ai",
  approvalStatus: "승인",
  questionText: "API 마감일을 앞당길 수 있나요?",
  answer: null,
  preference: "8월 25일 유지",
  concessionRange: "최대 8월 28일까지는 가능 (외부에 먼저 공개하지 않고 협상 카드로 유지)",
  dealbreaker: "8월 28일을 넘기는 것은 불가 (다음 마일스톤 일정과 직결)",
  priority: null,
  scheduleConstraint: null,
  activeFields: ["preference", "concessionRange", "dealbreaker"],
  confidenceLevel: "문서근거명확",
  sourceDocumentTitle: "schedule-agreement.md",
  reasoning:
    "일정 관련 질문이므로 preference/concessionRange/dealbreaker 위주로 채움. 8/28 초과 불가는 " +
    "다음 마일스톤과 직결되는 명확한 근거가 있어 dealbreaker로 분류.",
};

const officialDeadlinePosition: Position = {
  id: "pos_official_deadline",
  topic: "official_deadline",
  version: 1,
  origin: "ai",
  approvalStatus: "초안",
  questionText: "공식적으로 합의된 API 마감일이 정확히 언제인가요?",
  answer: "8월 25일입니다.",
  preference: null,
  concessionRange: null,
  dealbreaker: null,
  priority: null,
  scheduleConstraint: null,
  activeFields: ["answer"],
  confidenceLevel: "문서근거명확",
  sourceDocumentTitle: "schedule-agreement.md",
  reasoning: "단순 사실 확인성 질문이라 answer 필드 하나만 채움.",
};

const contactPersonPosition: Position = {
  id: "pos_contact_person",
  topic: "escalation_contact",
  version: 1,
  origin: "user",
  approvalStatus: "승인",
  questionText: "긴급 이슈 발생 시 누구에게 연락하면 되나요?",
  answer: "PM 재현에게 연락 주시면 됩니다.",
  preference: null,
  concessionRange: null,
  dealbreaker: null,
  priority: null,
  scheduleConstraint: null,
  activeFields: ["answer"],
  confidenceLevel: "문서근거명확",
  sourceDocumentTitle: null,
  reasoning: "AI가 예상하지 못한 질문이라 답변 작성자가 직접 추가.",
};

const meetingDeadline: Meeting = {
  id: "meeting_deadline_review",
  projectId: "project_dashboard",
  title: "API 마감일 협의 — 사전 준비",
  purpose: "API 개발 일정 관련 최종 조율",
  counterpartInfo: "사라 (미국 개발팀 리드, 영어 사용, 13시간 시차)",
  selectedDocumentIds: [projectOverviewDoc.id, scheduleAgreementDoc.id, sprintNotesDoc.id],
  status: "승인대기",
  positions: [deadlinePosition, officialDeadlinePosition, contactPersonPosition],
  transcript: [],
  holdItems: [],
  mandatoryReviewItems: [],
  createdAt: "2026-08-12T10:00:00+09:00",
};

// --- 회의 2: "API 마감일 협의 — 라이브" — 라이브 미팅 데모 (기능4/5/6/7) -----------

const liveTranscript: TranscriptEntry[] = [
  {
    id: "t1",
    speaker: "ai",
    speakerLabel: "AI 진행자",
    timestamp: "14:00:02",
    text:
      "저는 재현님을 대신해 사전 승인된 범위 안에서 진행합니다. 범위를 벗어나는 사안은 " +
      "보류 후 전달됩니다.",
    translatedText:
      "I'll be proceeding on behalf of Jaehyun, strictly within pre-approved boundaries. " +
      "Anything outside that scope will be held and followed up on later.",
  },
  {
    id: "t2",
    speaker: "counterpart",
    speakerLabel: "화자A (Sarah)",
    timestamp: "14:02:11",
    text: "API 마감일 3일만 당길 수 있나요?",
    translatedText: "Could we push the API deadline by 3 days?",
    matchResult: {
      matched: true,
      matchedTopic: "api_deadline",
      intentMatchReasoning:
        "마감일 연장 가능 여부를 묻는 질문으로, 승인된 안건 'api_deadline'과 핵심 의도가 일치함.",
      responseText:
        "원래 합의된 마감일은 8월 25일이지만, 최대 8월 28일까지는 가능합니다.",
      containsCriticalNumber: true,
      limitationNote: "8월 28일을 넘기는 일정 조정은 다음 마일스톤과 직결되어 불가합니다.",
      holdReason: null,
      numberConfirmation: { status: "대기중", secondsLeft: 10 },
    },
  },
  {
    id: "t3",
    speaker: "ai",
    speakerLabel: "AI 진행자",
    timestamp: "14:02:15",
    text: "원래 합의된 마감일은 8월 25일이지만, 최대 8월 28일까지는 가능합니다.",
    translatedText: "The original agreed deadline is Aug 25, but Aug 28 is possible at most.",
  },
  {
    id: "t4",
    speaker: "counterpart",
    speakerLabel: "화자A (Sarah)",
    timestamp: "14:03:40",
    text: "그럼 계약 기간도 같이 늘려야 하나요?",
    translatedText: "Then do we also need to extend the contract period?",
    matchResult: {
      matched: false,
      matchedTopic: null,
      intentMatchReasoning:
        "마감일 안건과는 별개로 계약 기간 연장을 묻는 질문. 승인된 안건 중 계약 기간에 대한 " +
        "근거가 없어 마감일 답변을 억지로 갖다 붙이지 않음.",
      responseText: null,
      containsCriticalNumber: false,
      limitationNote: null,
      holdReason:
        "계약 기간 연장에 대한 승인된 안건이 없습니다. 문서(sprint-notes-0728.md)에도 관련 " +
        "논의가 없어 추정으로 답변을 만들 수 없습니다.",
    },
  },
  {
    id: "t5",
    speaker: "counterpart",
    speakerLabel: "화자A (Sarah)",
    timestamp: "14:04:58",
    text: "혹시 QA 인력도 추가로 필요할까요?",
    translatedText: "Would we also need additional QA staff?",
    matchResult: {
      matched: false,
      matchedTopic: null,
      intentMatchReasoning: "QA 인력 관련 승인된 안건이 없고, 문서에도 근거가 없어 보류.",
      responseText: null,
      containsCriticalNumber: false,
      limitationNote: null,
      holdReason: "QA 인력 관련 근거 문서가 없어 지어내지 않고 보류합니다.",
    },
  },
];

const meetingLive: Meeting = {
  id: "meeting_deadline_live",
  projectId: "project_dashboard",
  title: "API 마감일 협의",
  purpose: "API 개발 일정 관련 최종 조율",
  counterpartInfo: "사라 (미국 개발팀 리드, 영어 사용, 13시간 시차)",
  selectedDocumentIds: [projectOverviewDoc.id, scheduleAgreementDoc.id, sprintNotesDoc.id],
  status: "라이브",
  positions: [{ ...deadlinePosition, id: "pos_api_deadline_live" }],
  transcript: liveTranscript,
  holdItems: [],
  mandatoryReviewItems: [],
  createdAt: "2026-08-13T14:00:00+09:00",
};

// --- 회의 3: "가격정책 최종 조율" — 후속답변대기 (기능8/8-1/9/10 데모) -------------

const priceReviewTranscript: TranscriptEntry[] = [
  {
    id: "pt1",
    speaker: "counterpart",
    speakerLabel: "화자A (Sarah)",
    timestamp: "10:12:03",
    text: "가격을 5% 정도 인상해야 할 것 같은데, 괜찮을까요?",
    translatedText: "We may need to raise the price by about 5% — would that work?",
    matchResult: {
      matched: false,
      matchedTopic: null,
      intentMatchReasoning: "가격 인상률 관련 승인된 안건은 있으나 구체 수치(5%) 확인 절차 필요.",
      responseText: "5% 인상안은 검토 중이며, 확정 전 확인이 필요합니다.",
      containsCriticalNumber: true,
      limitationNote: null,
      holdReason: null,
      numberConfirmation: { status: "미응답", secondsLeft: 0 },
    },
  },
];

const holdItems: HoldItem[] = [
  {
    id: "hold_contract_period",
    meetingId: "meeting_price_review",
    relatedTopic: "contract_period",
    reasonType: "핵심의도불일치",
    reason: "계약 기간 연장 여부는 승인된 안건에 근거가 없어 실시간에는 보류로 기록됨.",
    transcriptEntryId: "t4",
    status: "후속답변대기",
    followupAnswer:
      "계약 기간 연장은 이번 스프린트 범위에 포함되지 않으며, 별도 계약 문서 논의가 필요합니다.",
    followupSentAt: "2026-08-10T09:00:00+09:00",
    followupDeadline: "2026-08-11T09:00:00+09:00",
    reopenCount: 0,
    reopenHistory: [],
  },
  {
    id: "hold_price_increase",
    meetingId: "meeting_price_review",
    relatedTopic: "price_increase",
    reasonType: "숫자확인미응답",
    reason: "가격 인상률 5% 언급에 대해 10초 내 응답이 없어 자동 보류됨.",
    transcriptEntryId: "pt1",
    status: "확정",
    followupAnswer: "5% 인상안은 8월 결산 이후 재검토 예정입니다.",
    followupSentAt: "2026-08-09T11:00:00+09:00",
    followupDeadline: "2026-08-10T11:00:00+09:00",
    reopenCount: 1,
    reopenHistory: [
      { at: "2026-08-09T15:30:00+09:00", note: "조금 더 구체적인 일정이 필요하다는 재문의" },
    ],
  },
  {
    id: "hold_scope_dispute",
    meetingId: "meeting_price_review",
    relatedTopic: "qa_headcount",
    reasonType: "사후재보류",
    reason:
      "실시간에 '가능하다'로 전달됐던 QA 인력 관련 답변이 사후검토 결과 승인 범위를 벗어난 " +
      "매칭으로 판단되어 재보류로 전환됨.",
    transcriptEntryId: "t5",
    status: "실시간조율필요",
    followupAnswer: "QA 인력 추가는 검토 후 별도 안내드리겠습니다.",
    followupSentAt: "2026-08-07T09:00:00+09:00",
    followupDeadline: "2026-08-08T09:00:00+09:00",
    reopenCount: 2,
    reopenHistory: [
      { at: "2026-08-07T20:00:00+09:00", note: "구체적인 투입 시점을 다시 문의" },
      { at: "2026-08-08T13:00:00+09:00", note: "여전히 답변이 불충분하다며 재차 문의" },
    ],
  },
];

const mandatoryReviewItems: MandatoryReviewItem[] = [
  {
    id: "mr_contract_period",
    meetingId: "meeting_price_review",
    relatedTopic: "contract_period",
    label: "계약기간 연장",
    requestedByCounterpart: true,
    status: "확인전",
    confirmationNote: null,
  },
  {
    id: "mr_price_increase",
    meetingId: "meeting_price_review",
    relatedTopic: "price_increase",
    label: "가격 인상률 확정치",
    requestedByCounterpart: true,
    status: "확인후확정",
    confirmationNote: "5%로 최종 확정, 답변 작성자 확인 완료.",
  },
];

const meetingPriceReview: Meeting = {
  id: "meeting_price_review",
  projectId: "project_dashboard",
  title: "가격정책 최종 조율",
  purpose: "가격 인상안 및 계약 조건 최종 확인",
  counterpartInfo: "사라 (미국 개발팀 리드, 영어 사용, 13시간 시차)",
  selectedDocumentIds: [projectOverviewDoc.id, scheduleAgreementDoc.id],
  status: "후속답변대기",
  positions: [
    { ...deadlinePosition, id: "pos_api_deadline_price_review" },
  ],
  transcript: priceReviewTranscript,
  holdItems,
  mandatoryReviewItems,
  createdAt: "2026-08-06T10:00:00+09:00",
};

// ---------------------------------------------------------------------------
// 최상위 시드 export
// ---------------------------------------------------------------------------

export const seedProjects: Project[] = [
  {
    id: "project_dashboard",
    name: "B2B SaaS 대시보드 개발",
    description: "한국 PM팀 + 미국 개발팀 공동 진행. 13시간 시차.",
    documents: [projectOverviewDoc, scheduleAgreementDoc, sprintNotesDoc],
    meetingIds: [meetingDeadline.id, meetingLive.id, meetingPriceReview.id],
  },
];

export const seedMeetings: Meeting[] = [meetingDeadline, meetingLive, meetingPriceReview];
