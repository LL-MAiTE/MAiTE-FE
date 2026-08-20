import { NextRequest, NextResponse } from "next/server";
import { listBackendRequiredReviews } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/required-reviews?backendMeetingId=... — 백엔드 GET /meetings/:id/required-reviews 프록시 */
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
    const requiredReviews = await listBackendRequiredReviews(token, backendMeetingId);
    return NextResponse.json({ requiredReviews });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
