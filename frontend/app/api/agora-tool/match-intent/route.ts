import { NextRequest, NextResponse } from "next/server";
import { matchIntentOrHold } from "../../../../../ai-core/src/matchIntentOrHold";
import type { ApprovedPosition } from "../../../../../ai-core/src/types";
import { getMeetingSnapshot } from "@/lib/meetingSnapshotStore";

export const runtime = "nodejs";

/**
 * Agora Conversational AI Studio의 Custom Tool이 이 URL을 호출한다 (Agora 클라우드에서
 * 직접 호출하므로 public URL이어야 함 — localhost/사설망 URL은 등록 자체가 거부됨).
 *
 * /api/match-intent와 다른 점: 그쪽은 프론트가 실제 승인된 안건을 body로 넘겨주지만,
 * 여기는 Agora 쪽 LLM 함수 호출이 question만 넘겨준다. 회의별 승인 데이터는
 * lib/meetingSnapshotStore.ts(서버 메모리, 임시)에서 meetingId로 조회한다 —
 * query param(`?meetingId=...`) 또는 body의 meetingId로 받는다.
 *
 * meetingId가 없거나 스냅샷을 못 찾으면, 콘솔에서 직접 테스트할 때도 안 끊기도록
 * 데모용 안건(api_deadline) 하나로 폴백한다.
 */
// meetingId로 스냅샷을 못 찾았을 때 쓰는 폴백(콘솔에서 meetingId 없이 직접 테스트할 때용).
const DEMO_APPROVED_POSITIONS: ApprovedPosition[] = [
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
const GENERIC_HOLD_MESSAGE =
  "죄송하지만 그 부분은 제가 바로 답변드리기 어렵습니다. 회의 후 답변 작성자가 확인하고 별도로 전달드리겠습니다.";

// Agent(LLM)에게 돌려주는 응답은 필드 하나만 준다. 필드가 여러 개 섞여 있으면
// (matched/matchedTopic/internalReasoning 등) 모델이 "뭘 말해야 할지" 헷갈려서
// 아무 말도 안 하는 경우가 실제로 관찰됐다 — 그래서 응답 값은 무조건 response 하나,
// 판단 근거 등 디버깅 정보는 서버 콘솔 로그로만 남긴다.
function respond(response: string, debugLabel: string, debugInfo?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[agora-tool/match-intent] ${debugLabel}`, debugInfo ?? "");
  return NextResponse.json({ response }, { status: 200 });
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return respond(GENERIC_HOLD_MESSAGE, "OPENAI_API_KEY 미설정");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond(GENERIC_HOLD_MESSAGE, "요청 파싱 실패");
  }

  // Agora Custom Tool의 파라미터 스키마에서 실제 저장된 필드 이름이 question이 아니라
  // text/query/utterance 등으로 다를 수 있어서, 흔히 쓰일 만한 이름들을 관대하게 받는다.
  const question =
    (typeof body.question === "string" && body.question) ||
    (typeof body.text === "string" && body.text) ||
    (typeof body.query === "string" && body.query) ||
    (typeof body.utterance === "string" && body.utterance) ||
    "";

  if (!question.trim()) {
    return respond(GENERIC_HOLD_MESSAGE, "question 누락, 받은 body:", body);
  }

  // meetingId는 query param(?meetingId=...) 또는 body 둘 다 받는다 — Custom Tool의
  // Request URL에 회의별로 고정 쿼리스트링을 박아두는 방식을 쓸 수 있게.
  const meetingId =
    req.nextUrl.searchParams.get("meetingId") ||
    (typeof body.meetingId === "string" ? body.meetingId : null);

  const snapshot = meetingId ? getMeetingSnapshot(meetingId) : undefined;
  const approvedPositions = snapshot ?? DEMO_APPROVED_POSITIONS;
  const usedDemoFallback = !snapshot;

  try {
    const result = await matchIntentOrHold({
      question,
      approvedPositions,
    });

    const response = result.matched
      ? [result.responseText, result.limitationNote].filter(Boolean).join(" ")
      : GENERIC_HOLD_MESSAGE;

    return respond(response, `matched=${result.matched} meetingId=${meetingId ?? "(없음)"} demoFallback=${usedDemoFallback}`, {
      question,
      matchedTopic: result.matchedTopic,
      holdReason: result.holdReason,
      reasoning: result.intentMatchReasoning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return respond(GENERIC_HOLD_MESSAGE, "matchIntentOrHold 실패:", message);
  }
}
