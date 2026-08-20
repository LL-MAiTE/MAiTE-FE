import { NextRequest, NextResponse } from "next/server";
import { createBackendAgenda, addAndApproveBackendPosition, createBackendMeeting } from "@/lib/backendApi";
import { getBackendLink, saveBackendLink } from "@/lib/backendMeetingLinkStore";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

interface SyncPosition {
  topic: string;
  questionText: string;
  answer: string | null;
  preference: string | null;
  concessionRange: string | null;
  dealbreaker: string | null;
  priority: number | null;
  scheduleConstraint: string | null;
}

interface SyncRequestBody {
  localMeetingId: string;
  /** 백엔드 실 프로젝트 UUID(project.id) — [[tkzr-scope-decisions]] */
  projectId: string;
  title: string;
  purpose: string;
  counterpartInfo: string;
  approvedPositions: SyncPosition[];
}

/**
 * POST /api/backend/sync-meeting
 *
 * 프론트 로컬(localStorage) 회의를 백엔드 실 DB에 처음으로 반영한다.
 * "라이브 시작" 누를 때 한 번만 실행되고(이미 연결돼 있으면 그대로 재사용),
 * 백엔드가 실제로 Agora Conversational AI Agent를 붙일 수 있는 Meeting을 만들어준다.
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
    const agenda = await createBackendAgenda(token, {
      projectId: body.projectId,
      title: body.title,
      purpose: body.purpose,
      counterpartInfo: body.counterpartInfo,
    });

    // 승인된 안건들을 순서대로 백엔드에 추가 + 즉시 승인 처리.
    // 하나 실패해도 나머지는 계속 진행 — 매칭 대상이 하나라도 남는 게 전부 실패보다 낫다.
    for (const position of body.approvedPositions) {
      try {
        await addAndApproveBackendPosition(token, agenda.id, position);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[sync-meeting] 안건 "${position.topic}" 동기화 실패:`, err);
      }
    }

    const meeting = await createBackendMeeting(token, agenda.id);
    saveBackendLink(body.localMeetingId, {
      backendAgendaId: agenda.id,
      backendMeetingId: meeting.id,
    });

    return NextResponse.json({ backendMeetingId: meeting.id, reused: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
