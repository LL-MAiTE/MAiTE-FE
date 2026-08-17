import { NextRequest, NextResponse } from "next/server";
import { startBackendMeeting } from "@/lib/backendApi";

export const runtime = "nodejs";

/**
 * POST /api/backend/meeting-start
 * body: { backendMeetingId: string }
 *
 * 백엔드 POST /meetings/:id/start를 대신 호출한다. 백엔드가 안건+문서 기반 시스템
 * 프롬프트를 만들고, 자기 소유의 Agora Conversational AI Agent를 채널에 join시킨 뒤
 * 사람 참여자가 join할 수 있는 appId/channel/token을 돌려준다.
 */
export async function POST(req: NextRequest) {
  let body: { backendMeetingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.backendMeetingId) {
    return NextResponse.json({ error: "backendMeetingId가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await startBackendMeeting(body.backendMeetingId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
