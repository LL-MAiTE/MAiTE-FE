import { NextRequest, NextResponse } from "next/server";
import { stopConversationalAgent } from "@/lib/agoraAgentClient";
import { clearAgentSession, getAgentSession } from "@/lib/agoraAgentSessionStore";

export const runtime = "nodejs";

/**
 * POST /api/agora-agent/stop
 * body: { meetingId: string }
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

  const agentId = getAgentSession(meetingId);
  if (!agentId) {
    return NextResponse.json(
      { error: `이 회의(${meetingId})에 대해 실행 중인 agent 세션을 찾을 수 없습니다.` },
      { status: 404 }
    );
  }

  try {
    await stopConversationalAgent(agentId);
    clearAgentSession(meetingId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
