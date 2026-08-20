import { NextRequest, NextResponse } from "next/server";
import {
  ensureBackendProjectId,
  searchBackendUserByEmail,
  inviteBackendProjectMember,
  listBackendProjectMembers,
} from "@/lib/backendApi";
import { getBackendProjectId } from "@/lib/backendMeetingLinkStore";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/backend/project-members?localProjectId=
 * 이 로컬 프로젝트가 아직 백엔드에 동기화된 적 없으면(멤버 초대도, 라이브 미팅도 안 해봤으면)
 * 빈 목록을 돌려준다 — 그냥 조회만 하는데 백엔드 프로젝트를 새로 만들 필요는 없다.
 */
export async function GET(req: NextRequest) {
  const localProjectId = req.nextUrl.searchParams.get("localProjectId");
  if (!localProjectId) {
    return NextResponse.json({ error: "localProjectId가 필요합니다." }, { status: 400 });
  }

  const backendProjectId = getBackendProjectId(localProjectId);
  if (!backendProjectId) {
    return NextResponse.json({ members: [], synced: false });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const members = await listBackendProjectMembers(token, backendProjectId);
    return NextResponse.json({ members, synced: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/backend/project-members
 * body: { localProjectId, projectName, email, role }
 *
 * 상대가 백엔드에 이미 (/signup으로) 회원가입돼 있어야 초대할 수 있다 — 이메일로
 * 조회해서 없으면 그 사실을 그대로 에러로 돌려준다.
 */
export async function POST(req: NextRequest) {
  let body: { localProjectId?: string; projectName?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.localProjectId || !body.projectName || !body.email || !body.role) {
    return NextResponse.json(
      { error: "localProjectId, projectName, email, role이 모두 필요합니다." },
      { status: 400 }
    );
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

    const backendProjectId = await ensureBackendProjectId(token, body.localProjectId, body.projectName);
    const member = await inviteBackendProjectMember(
      token,
      backendProjectId,
      user.id,
      body.role as "ANSWERER" | "QUESTIONER" | "TEAM_MANAGER"
    );
    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
