import { NextRequest, NextResponse } from "next/server";
import { answerBackendHoldItem } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** POST /api/backend/hold-items/:id/answer — body: { answerText } — 백엔드 프록시 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { answerText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.answerText?.trim()) {
    return NextResponse.json({ error: "answerText가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const holdItem = await answerBackendHoldItem(token, params.id, body.answerText.trim());
    return NextResponse.json({ holdItem });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
