import { NextResponse } from "next/server";
import { deleteBackendPosition } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** DELETE /api/backend/positions/:id — 소프트 삭제(REJECTED + isLatest=false, 목록에서 제외됨). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    await deleteBackendPosition(token, params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
