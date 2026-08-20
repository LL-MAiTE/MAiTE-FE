import { NextRequest, NextResponse } from "next/server";
import { approveBackendPosition } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** POST /api/backend/positions/:id/approve — body: { approvalStatus? } (기본 "APPROVED") */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const approvalStatus = body.approvalStatus ?? "APPROVED";

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const position = await approveBackendPosition(token, params.id, approvalStatus);
    return NextResponse.json({ position });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
