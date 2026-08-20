import { NextResponse } from "next/server";
import { listBackendAgendas } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/projects/:id/agendas — 이 프로젝트에 딸린 안건(=회의) 전체 목록. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const agendas = await listBackendAgendas(token, params.id);
    return NextResponse.json({ agendas });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
