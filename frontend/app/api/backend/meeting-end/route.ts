import { NextRequest, NextResponse } from "next/server";
import { endBackendMeeting } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/backend/meeting-end
 * body: { backendMeetingId: string }
 *
 * 백엔드 POST /meetings/:id/end를 대신 호출한다. 음성 세션 종료 + AI 에이전트 퇴장 +
 * (hyeona/meeting-outcome 브랜치가 dev에 merge되면) 안건별 합의 결과 자동 추출까지 트리거된다.
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

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    await endBackendMeeting(token, body.backendMeetingId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
