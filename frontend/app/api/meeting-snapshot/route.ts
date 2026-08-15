import { NextRequest, NextResponse } from "next/server";
import { getMeetingSnapshot, listMeetingIds, saveMeetingSnapshot } from "@/lib/meetingSnapshotStore";
import type { ApprovedPosition } from "../../../../ai-core/src/types";

export const runtime = "nodejs";

/**
 * POST /api/meeting-snapshot  — 회의가 라이브로 시작될 때 승인된 안건 스냅샷을 서버에 올림
 * GET  /api/meeting-snapshot?meetingId=... — 디버깅용 조회
 *
 * lib/store.tsx의 startLiveMeeting()이 호출한다. 실제 백엔드가 붙기 전까지의 임시 다리.
 */
export async function POST(req: NextRequest) {
  let body: { meetingId?: string; approvedPositions?: ApprovedPosition[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 파싱 실패" }, { status: 400 });
  }

  if (!body.meetingId || !Array.isArray(body.approvedPositions)) {
    return NextResponse.json(
      { error: "meetingId(string)와 approvedPositions(배열)가 필요합니다." },
      { status: 400 }
    );
  }

  saveMeetingSnapshot(body.meetingId, body.approvedPositions);
  return NextResponse.json({ ok: true, meetingId: body.meetingId, count: body.approvedPositions.length });
}

export async function GET(req: NextRequest) {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ knownMeetingIds: listMeetingIds() });
  }
  const snapshot = getMeetingSnapshot(meetingId);
  if (!snapshot) {
    return NextResponse.json({ error: `meetingId '${meetingId}' 스냅샷 없음` }, { status: 404 });
  }
  return NextResponse.json({ meetingId, approvedPositions: snapshot });
}
