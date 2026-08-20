import { NextRequest, NextResponse } from "next/server";
import { listBackendDocuments, uploadBackendDocument, updateBackendDocument } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/documents?projectId=... — projectId는 백엔드 실 프로젝트 UUID. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const documents = await listBackendDocuments(token, projectId);
    return NextResponse.json({ documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/backend/documents
 * body: { projectId, title, content, isCoreContext? }
 *
 * 프로젝트 화면에서 직접 붙여넣은 문서를 업로드한다. isCoreContext가 true면 업로드
 * 직후 한 번 더 PATCH해서 반영한다(업로드 API 자체엔 그 필드가 없음).
 */
export async function POST(req: NextRequest) {
  let body: { projectId?: string; title?: string; content?: string; isCoreContext?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.projectId || !body.title?.trim()) {
    return NextResponse.json({ error: "projectId, title이 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    let document = await uploadBackendDocument(token, body.projectId, body.title.trim(), body.content ?? "");
    if (body.isCoreContext) {
      document = await updateBackendDocument(token, document.id, true);
    }
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
