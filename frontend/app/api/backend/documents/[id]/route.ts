import { NextResponse } from "next/server";
import { getBackendDocument, deleteBackendDocument } from "@/lib/backendApi";

export const runtime = "nodejs";

/** GET /api/backend/documents/:id — content(본문) 포함 단건 조회 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const document = await getBackendDocument(params.id);
    return NextResponse.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** DELETE /api/backend/documents/:id — 안건 참조 문서로 쓰이고 있으면 백엔드가 409로 거부 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteBackendDocument(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
