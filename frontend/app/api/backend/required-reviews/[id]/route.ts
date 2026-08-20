import { NextResponse } from "next/server";
import { confirmBackendRequiredReview } from "@/lib/backendApi";
import { getSessionToken } from "@/lib/session";

export const runtime = "nodejs";

/** PATCH /api/backend/required-reviews/:id — 답변 작성자 확인 처리(조건부합의 → 확정) 프록시 */
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const requiredReview = await confirmBackendRequiredReview(token, params.id);
    return NextResponse.json({ requiredReview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
