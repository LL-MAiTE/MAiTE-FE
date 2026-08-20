import { NextRequest, NextResponse } from "next/server";
import { markBackendNotificationRead, markAllBackendNotificationsRead } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/backend/notifications/mark-read
 * body: { notificationId: string } 또는 { all: true }
 */
export async function POST(req: NextRequest) {
  let body: { notificationId?: string; all?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    if (body.all) {
      await markAllBackendNotificationsRead(token);
    } else if (body.notificationId) {
      await markBackendNotificationRead(token, body.notificationId);
    } else {
      return NextResponse.json({ error: "notificationId 또는 all이 필요합니다." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
