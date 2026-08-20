import { NextResponse } from "next/server";
import { listBackendNotifications } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/notifications — 로그인한 사용자 본인의 알림함을 조회한다. */
export async function GET() {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const notifications = await listBackendNotifications(token);
    return NextResponse.json({ notifications });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
