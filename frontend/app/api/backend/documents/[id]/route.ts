import { NextRequest, NextResponse } from "next/server";
import { getBackendDocument, deleteBackendDocument, updateBackendDocument } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/documents/:id — content(본문) 포함 단건 조회 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const document = await getBackendDocument(token, params.id);
    return NextResponse.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** PATCH /api/backend/documents/:id — body: { isCoreContext: boolean } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { isCoreContext?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (typeof body.isCoreContext !== "boolean") {
    return NextResponse.json({ error: "isCoreContext(boolean)가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const document = await updateBackendDocument(token, params.id, body.isCoreContext);
    return NextResponse.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** DELETE /api/backend/documents/:id — 안건 참조 문서로 쓰이고 있으면 백엔드가 409로 거부 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    await deleteBackendDocument(token, params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
