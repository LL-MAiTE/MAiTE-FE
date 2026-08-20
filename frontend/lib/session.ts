import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * 서버 전용. 로그인한 사용자의 백엔드 JWT를 httpOnly 쿠키로 들고 다닌다.
 *
 * [[tkzr-scope-decisions]]에 적어뒀던 "고정 서비스 계정 토큰(BACKEND_API_TOKEN)만 쓰는"
 * 구조를 실제 로그인 사용자별 토큰으로 바꾸는 첫 단계. 클라이언트는 이 쿠키를 직접
 * 못 읽지만(httpOnly), 같은 출처(same-origin) fetch에는 브라우저가 자동으로 실어
 * 보내주므로 각 fetch 호출부에서 따로 Authorization 헤더를 붙일 필요가 없다.
 *
 * lib/auth.tsx가 localStorage에 들고 있는 token/user는 화면 표시(이름/이메일, 로그인
 * 여부 판단)용이고, 백엔드 API 호출의 실제 인증은 항상 이 쿠키가 담당한다 — 두 값은
 * 로그인/회원가입 시점에 항상 같이 발급되므로 어긋날 일이 없다(로그아웃도 항상 같이 지움).
 */

export const SESSION_COOKIE = "tkzr_session";

// 백엔드 JwtProvider의 만료 기간(30일)과 맞춘다.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE);
}

/** 현재 요청의 로그인 사용자 토큰. 없으면(비로그인) null. */
export function getSessionToken(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

/** 로그인 사용자 토큰이 없으면 던지는 용도 — 라우트 핸들러에서 401 처리에 씀. */
export function requireSessionToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}
