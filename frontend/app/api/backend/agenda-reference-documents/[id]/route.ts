import { NextRequest, NextResponse } from "next/server";
import { updateBackendReferenceDocument } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** PATCH /api/backend/agenda-reference-documents/:id — body: { excluded: boolean } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { excluded?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (typeof body.excluded !== "boolean") {
    return NextResponse.json({ error: "excluded(boolean)가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const referenceDocument = await updateBackendReferenceDocument(token, params.id, body.excluded);
    return NextResponse.json({ referenceDocument });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
