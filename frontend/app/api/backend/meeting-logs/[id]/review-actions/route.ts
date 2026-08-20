import { NextRequest, NextResponse } from "next/server";
import { createBackendReviewAction } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST /api/backend/meeting-logs/:id/review-actions
 * body: { action: "APPROVED"|"REVISED"|"WITHDRAWN"|"RE_HELD", note?: string }
 *
 * 백엔드 프록시. RE_HELD면 백엔드가 새 hold_item을 자동 생성한다 — 호출부가 이후
 * 보류함 목록을 다시 불러오면 반영된다.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }
  const VALID = ["APPROVED", "REVISED", "WITHDRAWN", "RE_HELD"];
  if (!body.action || !VALID.includes(body.action)) {
    return NextResponse.json({ error: `action은 ${VALID.join("/")} 중 하나여야 합니다.` }, { status: 400 });
  }

  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const result = await createBackendReviewAction(
      token,
      params.id,
      body.action as "APPROVED" | "REVISED" | "WITHDRAWN" | "RE_HELD",
      body.note
    );
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
