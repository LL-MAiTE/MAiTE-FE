import { NextRequest, NextResponse } from "next/server";
import { createBackendAgenda } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/backend/agendas
 * body: { projectId, title, purpose, counterpartInfo, counterpartLanguageCode }
 *
 * 회의 준비(=백엔드 Agenda) 생성. meeting.id는 이 응답의 agenda id를 그대로 쓴다.
 */
export async function POST(req: NextRequest) {
  let body: {
    projectId?: string;
    title?: string;
    purpose?: string;
    counterpartInfo?: string;
    counterpartLanguageCode?: string;
  };
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
    const agenda = await createBackendAgenda(token, {
      projectId: body.projectId,
      title: body.title.trim(),
      purpose: body.purpose ?? "",
      counterpartInfo: body.counterpartInfo ?? "",
      counterpartLanguageCode: body.counterpartLanguageCode,
    });
    return NextResponse.json({ agenda }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
