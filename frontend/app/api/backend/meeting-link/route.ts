import { NextRequest, NextResponse } from "next/server";
import { getBackendLink } from "@/lib/backendMeetingLinkStore";

export const runtime = "nodejs";

/**
 * GET /api/backend/meeting-link?localMeetingId=...
 *
 * "라이브 시작"을 이미 한 번 눌러서 백엔드에 동기화된 미팅인지 조회한다. 읽기 전용 —
 * 없으면 만들지 않고 그냥 backendMeetingId: null을 돌려준다. "결과 검토" 화면이 이걸로
 * 실제 백엔드 데이터를 붙일지, 아직 로컬(mock)만 있는 미팅이라 기존 로컬 표시로
 * 폴백할지를 판단한다.
 */
export async function GET(req: NextRequest) {
  const localMeetingId = req.nextUrl.searchParams.get("localMeetingId");
  if (!localMeetingId) {
    return NextResponse.json({ error: "localMeetingId가 필요합니다." }, { status: 400 });
  }

  const link = getBackendLink(localMeetingId);
  return NextResponse.json({ backendMeetingId: link?.backendMeetingId ?? null });
}
