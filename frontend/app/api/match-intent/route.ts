import { NextRequest, NextResponse } from "next/server";
// ⚠️ B(본인) 담당 파일. ai-core/src/matchIntentOrHold.ts를 직접 재사용한다 —
// 프롬프트/판단 로직의 유일한 원본(source of truth)은 ai-core 쪽에 남겨두고,
// 여기서는 실행만 담당한다 (프롬프트 튜닝은 ai-core/src/matchIntentOrHold.ts에서).
import { matchIntentOrHold } from "../../../../ai-core/src/matchIntentOrHold";
import type { ApprovedPosition } from "../../../../ai-core/src/types";

export const runtime = "nodejs";

/**
 * POST /api/match-intent
 * body: { question: string, approvedPositions: ApprovedPosition[] }
 *
 * 실시간 미팅 화면(lib/store.tsx의 askQuestion)이 호출한다. 서버에서만 OPENAI_API_KEY를
 * 쓰므로 클라이언트에 키가 노출되지 않는다. 키가 없거나 호출이 실패하면 클라이언트 쪽
 * (lib/store.tsx)에서 mock 로직으로 폴백하도록 설계했다 — 그래서 이 라우트는 실패 시
 * 그냥 에러를 그대로 반환하면 된다 (여기서 자체적으로 지어내지 않음, 규칙 1과 동일한 정신).
 */
export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 서버에 설정되어 있지 않습니다 (frontend/.env.local 확인)." },
      { status: 503 }
    );
  }

  let body: { question?: string; approvedPositions?: ApprovedPosition[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }

  if (!body.question || !Array.isArray(body.approvedPositions)) {
    return NextResponse.json(
      { error: "question(string)과 approvedPositions(배열)가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const result = await matchIntentOrHold({
      question: body.question,
      approvedPositions: body.approvedPositions,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `matchIntentOrHold 호출 실패: ${message}` }, { status: 502 });
  }
}
