import { NextRequest, NextResponse } from "next/server";
import { markBackendNotificationRead, markAllBackendNotificationsRead } from "@/lib/backendApi";

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

  try {
    if (body.all) {
      await markAllBackendNotificationsRead();
    } else if (body.notificationId) {
      await markBackendNotificationRead(body.notificationId);
    } else {
      return NextResponse.json({ error: "notificationId 또는 all이 필요합니다." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
