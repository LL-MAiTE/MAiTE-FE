import type { ApprovedPosition } from "../../ai-core/src/types";

/**
 * meetingId로 스냅샷을 못 찾았을 때 쓰는 폴백 안건 (콘솔에서 meetingId 없이 직접 테스트할 때용)과,
 * 보류 시 상대방에게 들려줄 고정 문구. /api/agora-tool/match-intent와
 * /api/agora-tool/chat-completions 양쪽에서 공용으로 쓴다.
 */
export const DEMO_APPROVED_POSITIONS: ApprovedPosition[] = [
  {
    topic: "api_deadline",
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
    reasoning: "일정 관련 질문이라 preference/concessionRange/dealbreaker 위주로 채움.",
    approvalStatus: "승인",
  },
];

// 상대방에게 보류를 알릴 때 쓰는 고정 문구. 내부 holdReason(판단 근거)은 로그용이지,
// 상대방에게 그대로 노출할 이유가 없어서 분리한다.
export const GENERIC_HOLD_MESSAGE =
  "죄송하지만 그 부분은 제가 바로 답변드리기 어렵습니다. 회의 후 답변 작성자가 확인하고 별도로 전달드리겠습니다.";
