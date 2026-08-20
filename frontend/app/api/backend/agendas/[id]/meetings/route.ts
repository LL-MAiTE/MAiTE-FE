import { NextResponse } from "next/server";
import { listBackendMeetingsByAgenda } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/agendas/:id/meetings — 이 안건이 실제로 라이브를 시작한 적 있는지,
 * 시작했다면 지금 Meeting 상태가 뭔지 조회한다(보통 0개 또는 1개). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const meetings = await listBackendMeetingsByAgenda(token, params.id);
    return NextResponse.json({ meetings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
