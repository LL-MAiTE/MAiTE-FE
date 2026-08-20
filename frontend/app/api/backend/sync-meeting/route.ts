import { NextRequest, NextResponse } from "next/server";
import { createBackendMeeting } from "@/lib/backendApi";
import { getBackendLink, saveBackendLink } from "@/lib/backendMeetingLinkStore";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

interface SyncRequestBody {
  /** 프론트 회의 id — Phase 5부터 이 값 자체가 이미 백엔드 Agenda UUID다(meeting.id 참고). */
  localMeetingId: string;
}

/**
 * POST /api/backend/sync-meeting
 *
 * "라이브 시작" 누를 때 백엔드에 실제 Meeting(Agora 세션 단위)을 만든다. Agenda·Position은
 * 이제 회의 준비(승인) 단계에서 이미 실 백엔드에 만들어져 있으므로(Phase 5), 여기서는
 * 그 Agenda에 Meeting만 하나 붙이면 된다 — 이미 만든 적 있으면 그대로 재사용한다.
 */
export async function POST(req: NextRequest) {
  let body: SyncRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.localMeetingId) {
    return NextResponse.json({ error: "localMeetingId가 필요합니다." }, { status: 400 });
  }

  const existing = getBackendLink(body.localMeetingId);
  if (existing) {
    return NextResponse.json({ backendMeetingId: existing.backendMeetingId, reused: true });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    // localMeetingId가 곧 backendAgendaId다.
    const meeting = await createBackendMeeting(token, body.localMeetingId);
    saveBackendLink(body.localMeetingId, {
      backendAgendaId: body.localMeetingId,
      backendMeetingId: meeting.id,
    });

    return NextResponse.json({ backendMeetingId: meeting.id, reused: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
