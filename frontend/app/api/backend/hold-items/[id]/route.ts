import { NextRequest, NextResponse } from "next/server";
import { updateBackendHoldItemStatus } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * PATCH /api/backend/hold-items/:id
 * body: { status: "CONFIRMED_TIMEOUT" | "NEEDS_REALTIME" }
 *
 * 백엔드 PATCH /hold-items/:id 프록시. 실제로는 24시간 타임아웃 스케줄러가 자동
 * 처리하지만, "확정 처리(시뮬레이션)" 버튼으로 즉시 처리해볼 수 있게 그대로 둔다.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (body.status !== "CONFIRMED_TIMEOUT" && body.status !== "NEEDS_REALTIME") {
    return NextResponse.json({ error: "status는 CONFIRMED_TIMEOUT 또는 NEEDS_REALTIME이어야 합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const holdItem = await updateBackendHoldItemStatus(token, params.id, body.status);
    return NextResponse.json({ holdItem });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
