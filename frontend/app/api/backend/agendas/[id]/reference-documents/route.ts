import { NextRequest, NextResponse } from "next/server";
import { selectBackendReferenceDocuments } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** POST /api/backend/agendas/:id/reference-documents — body: { sourceDocumentIds: string[] } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { sourceDocumentIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.sourceDocumentIds || body.sourceDocumentIds.length === 0) {
    return NextResponse.json({ error: "sourceDocumentIds가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const referenceDocuments = await selectBackendReferenceDocuments(token, params.id, body.sourceDocumentIds);
    return NextResponse.json({ referenceDocuments }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
