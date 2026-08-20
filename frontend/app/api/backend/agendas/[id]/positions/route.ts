import { NextRequest, NextResponse } from "next/server";
import { listBackendPositions, createBackendPosition } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/backend/agendas/:id/positions — isLatest 안건 목록. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const positions = await listBackendPositions(token, params.id);
    return NextResponse.json({ positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** POST /api/backend/agendas/:id/positions — 답변 작성자가 직접 안건 추가. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: {
    topic?: string;
    questionText?: string;
    answer?: string | null;
    preference?: string | null;
    concessionRange?: string | null;
    dealbreaker?: string | null;
    priority?: number | null;
    scheduleConstraint?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body.topic?.trim() || !body.questionText?.trim()) {
    return NextResponse.json({ error: "topic, questionText가 필요합니다." }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const position = await createBackendPosition(token, params.id, {
      topic: body.topic.trim(),
      questionText: body.questionText.trim(),
      answer: body.answer ?? null,
      preference: body.preference ?? null,
      concessionRange: body.concessionRange ?? null,
      dealbreaker: body.dealbreaker ?? null,
      priority: body.priority ?? null,
      scheduleConstraint: body.scheduleConstraint ?? null,
    });
    return NextResponse.json({ position }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
