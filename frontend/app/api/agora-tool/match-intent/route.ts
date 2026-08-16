import { NextRequest, NextResponse } from "next/server";
import { matchIntentOrHold } from "../../../../../ai-core/src/matchIntentOrHold";
import { getMeetingSnapshot } from "@/lib/meetingSnapshotStore";
import { DEMO_APPROVED_POSITIONS, GENERIC_HOLD_MESSAGE } from "@/lib/agoraDemoData";

export const runtime = "nodejs";

/**
 * ⚠️ Agora Conversational AI Studio "Custom Tool"(function-calling) 방식 전용 라우트.
 * Studio 콘솔의 Test 패널(=pipeline_id 그대로, 우리가 REST로 오버라이드하지 않는 실행)에서만
 * 안정적으로 동작하는 것으로 확인됨 — REST `/join`으로 직접 시작한 Agent는 이 Custom Tool을
 * 함수로 인식하지 못하고 이름을 그냥 텍스트로 읽어버리는 문제가 있었다 (REST 문서에 tools/
 * function-calling 필드가 아예 없음 — Custom Tool은 Studio 전용 기능으로 보임).
 *
 * REST로 직접 시작하는 Agent는 대신 ../chat-completions/route.ts(Custom LLM 방식)를 쓴다.
 * 이 라우트는 콘솔 Test 패널용으로 계속 남겨둔다.
 */

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
