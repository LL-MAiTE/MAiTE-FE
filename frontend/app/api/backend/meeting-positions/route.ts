import { NextRequest, NextResponse } from "next/server";
import { listBackendMeetingPositions } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/meeting-positions?backendMeetingId=... — 백엔드 GET /meetings/:id/positions 프록시.
 * 이 회의에서 다룬 승인 안건 스냅샷 + 종료 시 분석된 합의 결과("회의 요약")를 준다. */
export async function GET(req: NextRequest) {
  const backendMeetingId = req.nextUrl.searchParams.get("backendMeetingId");
  if (!backendMeetingId) {
    return NextResponse.json({ error: "backendMeetingId가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const positions = await listBackendMeetingPositions(token, backendMeetingId);
    return NextResponse.json({ positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
