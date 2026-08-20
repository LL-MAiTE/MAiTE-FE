import { NextRequest, NextResponse } from "next/server";
import { reviseBackendPosition } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/backend/positions/:id/revise
 * body: { approvalStatus, topic?, questionText?, answer?, preference?, concessionRange?, dealbreaker?, priority?, scheduleConstraint? }
 * 넘긴 필드만 바뀌고 나머지는 이전 버전 값을 그대로 이어받는다(백엔드가 처리) — 새 버전(version+1)이 생성된다.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.approvalStatus) {
    return NextResponse.json({ error: "approvalStatus가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const position = await reviseBackendPosition(token, params.id, body as never);
    return NextResponse.json({ position });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
