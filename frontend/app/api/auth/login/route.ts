import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/auth/login — 백엔드 POST /auth/login을 그대로 프록시한다.
 * 로그인은 permitAll 엔드포인트라 고정 서비스 토큰(BACKEND_API_TOKEN) 없이 호출한다.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "이메일과 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const baseUrl = process.env.BACKEND_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "BACKEND_BASE_URL이 서버에 설정되어 있지 않습니다." }, { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return NextResponse.json(
        { error: data.message ?? `로그인에 실패했습니다 (HTTP ${res.status})` },
        { status: res.status }
      );
    }
    return NextResponse.json({ token: data.data.token, user: data.data.user });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
