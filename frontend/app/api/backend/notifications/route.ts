import { NextResponse } from "next/server";
import { listBackendNotifications } from "@/lib/backendApi";

export const runtime = "nodejs";

/** GET /api/backend/notifications — 로그인 화면이 없어 고정 서비스 계정 알림함을 그대로 노출한다. */
export async function GET() {
  try {
    const notifications = await listBackendNotifications();
    return NextResponse.json({ notifications });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
