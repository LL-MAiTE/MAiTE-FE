import { NextResponse } from "next/server";
import { reopenBackendHoldItem } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** POST /api/backend/hold-items/:id/reopen — 백엔드 프록시. 상한(2회) 초과 시 백엔드가
 * 400(REOPEN_LIMIT_EXCEEDED)으로 거부하고, 여기서는 그 메시지를 그대로 전달한다. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const holdItem = await reopenBackendHoldItem(token, params.id);
    return NextResponse.json({ holdItem });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
