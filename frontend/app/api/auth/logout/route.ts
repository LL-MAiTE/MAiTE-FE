import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

/** POST /api/auth/logout — 세션 쿠키 삭제. 백엔드는 JWT가 stateless라 서버쪽에 따로 알릴 게 없다. */
export async function POST() {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
