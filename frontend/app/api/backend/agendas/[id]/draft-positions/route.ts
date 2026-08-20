import { NextResponse } from "next/server";
import { generateBackendDraftPositions } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** POST /api/backend/agendas/:id/draft-positions — AI 안건 초안 생성(백엔드가 OpenAI 직접 호출). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const positions = await generateBackendDraftPositions(token, params.id);
    return NextResponse.json({ positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
