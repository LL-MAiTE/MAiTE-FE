import { NextRequest, NextResponse } from "next/server";
import { respondToInvitation } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** POST /api/backend/project-members/:id/respond — body: { accept: boolean } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { accept?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (typeof body.accept !== "boolean") {
    return NextResponse.json({ error: "accept(boolean)가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const member = await respondToInvitation(token, params.id, body.accept);
    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
