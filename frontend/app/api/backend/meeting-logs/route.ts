import { NextRequest, NextResponse } from "next/server";
import { listBackendMeetingLogs } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/meeting-logs?backendMeetingId=... — 백엔드 GET /meetings/:id/meeting-logs 프록시 */
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
    const logs = await listBackendMeetingLogs(token, backendMeetingId);
    return NextResponse.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
