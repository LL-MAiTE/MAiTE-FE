import { NextRequest, NextResponse } from "next/server";
import { buildRtcToken } from "@/lib/agoraRtcToken";
import { startConversationalAgent } from "@/lib/agoraAgentClient";
import { setAgentSession } from "@/lib/agoraAgentSessionStore";

export const runtime = "nodejs";

// 사람 참여자 uid(보통 0 = 자동배정, 또는 작은 숫자)와 안 겹치게 고정값 사용.
const AGENT_RTC_UID = 9999;

/**
 * POST /api/agora-agent/start
 * body: { meetingId: string }
 *
 * "미팅 시작"을 우리 앱에서 눌렀을 때, Agora 콘솔의 "tkzr" Agent를 그 회의와 같은
 * RTC 채널(=meetingId)에 join시킨다. 이걸로 사람 참여자(lib/agoraRtc.ts로 join)와
 * AI 진행자가 처음으로 같은 채널에서 만난다.
 */
export async function POST(req: NextRequest) {
  let body: { meetingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }

  if (!body.meetingId || !body.meetingId.trim()) {
    return NextResponse.json({ error: "meetingId가 필요합니다." }, { status: 400 });
  }
  const meetingId = body.meetingId.trim();

  try {
    const { token } = buildRtcToken(meetingId, AGENT_RTC_UID, "publisher");
    const result = await startConversationalAgent({
      name: `agent-${meetingId}`,
      channel: meetingId,
      token,
      agentRtcUid: String(AGENT_RTC_UID),
    });
    setAgentSession(meetingId, result.agentId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
