import { NextRequest, NextResponse } from "next/server";
import { createBackendConnection, syncBackendConnection } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/backend/git-sync
 * body: { projectId, repo, accessToken }
 *
 * projectId는 이제 항상 백엔드 실 프로젝트 UUID다(project.id가 곧 백엔드 id — [[tkzr-scope-decisions]]
 * 참고). 연동 등록 + 동기화를 한 번에 처리한다. 백엔드는 실제 GitHub API로 기본 브랜치의
 * .md/.mdx/.txt/.rst 파일(최대 30개)을 가져온다 — 근데 그 문서들은 백엔드 DB
 * (source_document)에만 쌓이고, 프론트 로컬(mock) project.documents 목록엔 자동으로
 * 안 섞인다(단건 조회 API가 없어 content를 못 받아옴 — 백엔드 쪽 "미구현" 항목).
 * 그래서 지금은 "몇 개 동기화됐는지 + 파일명 목록"만 결과로 보여준다.
 */
export async function POST(req: NextRequest) {
  let body: { projectId?: string; repo?: string; accessToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.projectId || !body.repo || !body.accessToken) {
    return NextResponse.json(
      { error: "projectId, repo, accessToken이 모두 필요합니다." },
      { status: 400 }
    );
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const connection = await createBackendConnection(token, body.projectId, body.repo, body.accessToken);
    const result = await syncBackendConnection(token, connection.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
