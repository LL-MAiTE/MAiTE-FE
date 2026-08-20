import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }

  const baseUrl = (process.env.BACKEND_BASE_URL ?? "").replace(/\/$/, "");
  if (!baseUrl) {
    return NextResponse.json({ error: "BACKEND_BASE_URL이 설정되지 않았습니다." }, { status: 500 });
  }

  let beRes: Response;
  try {
    beRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "백엔드 서버에 연결할 수 없습니다." }, { status: 502 });
  }

  const beData = await beRes.json().catch(() => ({ success: false }));
  if (!beRes.ok || !beData.success) {
    return NextResponse.json(
      { error: beData.message ?? "이메일 또는 비밀번호가 올바르지 않습니다." },
      { status: beRes.status === 200 ? 401 : beRes.status }
    );
  }

  const { token, user } = beData.data as { token: string; user: { id: string; email: string; name: string } };

  const response = NextResponse.json({ user });
  response.cookies.set("maite_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7일
    path: "/",
  });
  return response;
}
