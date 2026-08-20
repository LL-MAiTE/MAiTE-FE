import { NextResponse } from "next/server";
import { deleteBackendAgenda } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** DELETE /api/backend/agendas/:id — 회의(안건)를 자식 레코드 전체와 함께 지운다. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    await deleteBackendAgenda(token, params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
