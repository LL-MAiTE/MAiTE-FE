import { NextRequest, NextResponse } from "next/server";
import { listBackendProjects, createBackendProject } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/backend/projects — 로그인한 사용자가 멤버로 속한 프로젝트만 돌아온다
 * (백엔드 GET /projects = getMyProjects(), SecurityUtil로 현재 사용자 기준 필터링됨).
 * POST /api/backend/projects — 새 프로젝트 생성 + 만든 사람을 TEAM_MANAGER로 자동 등록.
 *
 * lib/store.tsx가 여기서 받은 프로젝트 목록에 로컬(mock) 문서/회의 개수만 덧붙여서 쓴다 —
 * 문서·회의·안건은 아직 이 마이그레이션 범위 밖이다(진행 중, [[tkzr-scope-decisions]]).
 */
export async function GET() {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const projects = await listBackendProjects(token);
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name이 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const project = await createBackendProject(token, body.name.trim(), body.description?.trim() ?? "");
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
