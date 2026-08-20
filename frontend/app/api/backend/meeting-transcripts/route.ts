import { NextRequest, NextResponse } from "next/server";
import { getBackendTranscripts } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/backend/meeting-transcripts?backendMeetingId=...
 *
 * 백엔드 GET /meetings/:id/transcripts를 대신 호출한다. 라이브 화면이 진행 중인 실제
 * 음성 대화(사람 발화 + AI 응답 원문)를 폴링으로 가져와 "실시간 대화" 패널에 보여주는 데 쓴다.
 */
export async function GET(req: NextRequest) {
  const backendMeetingId = req.nextUrl.searchParams.get("backendMeetingId");
  if (!backendMeetingId) {
    return NextResponse.json({ error: "backendMeetingId가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const transcripts = await getBackendTranscripts(token, backendMeetingId);
    return NextResponse.json({ transcripts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
