import { NextRequest, NextResponse } from "next/server";
import { searchBackendUserByEmail, inviteBackendProjectMember, listBackendProjectMembers } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/project-members?projectId= — projectId는 백엔드 실 프로젝트 UUID. */
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
    const members = await listBackendProjectMembers(token, projectId);
    return NextResponse.json({ members });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/backend/project-members
 * body: { projectId, email, role }
 *
 * 상대가 백엔드에 이미 (/signup으로) 회원가입돼 있어야 초대할 수 있다 — 이메일로
 * 조회해서 없으면 그 사실을 그대로 에러로 돌려준다.
 */
export async function POST(req: NextRequest) {
  let body: { projectId?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.projectId || !body.email || !body.role) {
    return NextResponse.json({ error: "projectId, email, role이 모두 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const user = await searchBackendUserByEmail(token, body.email);
    if (!user) {
      return NextResponse.json(
        { error: `"${body.email}"로 가입된 사용자를 찾을 수 없습니다. 먼저 백엔드에 회원가입이 필요합니다.` },
        { status: 404 }
      );
    }

    const member = await inviteBackendProjectMember(
      token,
      body.projectId,
      user.id,
      body.role as "ANSWERER" | "QUESTIONER" | "TEAM_MANAGER"
    );
    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
