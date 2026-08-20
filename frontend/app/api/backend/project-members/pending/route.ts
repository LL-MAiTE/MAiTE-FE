import { NextResponse } from "next/server";
import { listMyPendingInvitations } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/project-members/pending — 로그인한 사람에게 온, 아직 응답 안 한 초대 전체. */
export async function GET() {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const invitations = await listMyPendingInvitations(token);
    return NextResponse.json({ invitations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
