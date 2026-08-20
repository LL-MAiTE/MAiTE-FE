import { NextRequest, NextResponse } from "next/server";
import { listBackendDocuments } from "@/lib/backendApi";
import { getBackendProjectId } from "@/lib/backendMeetingLinkStore";

export const runtime = "nodejs";

/**
 * GET /api/backend/documents?localProjectId=...
 *
 * 이 로컬 프로젝트가 아직 백엔드 프로젝트와 연결된 적 없으면(Git 연동을 한 번도
 * 안 했으면) documents: [] 를 반환한다 — 새로 만들지는 않는다(조회 전용).
 */
export async function GET(req: NextRequest) {
  const localProjectId = req.nextUrl.searchParams.get("localProjectId");
  if (!localProjectId) {
    return NextResponse.json({ error: "localProjectId가 필요합니다." }, { status: 400 });
  }

  const backendProjectId = getBackendProjectId(localProjectId);
  if (!backendProjectId) {
    return NextResponse.json({ documents: [] });
  }

  try {
    const documents = await listBackendDocuments(backendProjectId);
    return NextResponse.json({ documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
