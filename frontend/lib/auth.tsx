"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * 로그인/회원가입 상태 관리. 백엔드(MAiTE-BE)의 /auth/login, /auth/signup이 실제로
 * 존재해서(JWT 발급) 여기 붙였다 — /api/auth/* 라우트가 얇게 프록시한다.
 *
 * 발급받은 JWT는 lib/session.ts가 httpOnly 쿠키(tkzr_session)로 들고 있고, 이게
 * 백엔드 API 호출의 실제 인증 수단이다(lib/backendApi.ts가 이 쿠키 값을 그대로
 * Authorization 헤더에 실어 보냄 — 더 이상 고정 서비스 계정 토큰을 쓰지 않는다).
 * 여기 이 파일이 localStorage(tkzr_auth_v1)에 따로 저장하는 건 화면 표시용 사본
 * (user.name/email, 로그인 여부 판단)일 뿐이다 — 로그인/회원가입/로그아웃 시점에
 * 쿠키와 항상 같이 갱신되므로 둘이 어긋날 일은 없다.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

const STORAGE_KEY = "tkzr_auth_v1";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function postJson(path: string, body: unknown): Promise<StoredAuth> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `요청에 실패했습니다 (HTTP ${res.status})`);
  }
  return data as StoredAuth;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setAuth(JSON.parse(raw));
    } catch {
      // 손상된 값이면 로그아웃 상태로 시작
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = useCallback((next: StoredAuth | null) => {
    setAuth(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await postJson("/api/auth/login", { email, password });
      persist(result);
    },
    [persist]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await postJson("/api/auth/signup", { email, password, name });
      persist(result);
    },
    [persist]
  );

  const logout = useCallback(() => {
    persist(null);
    // 실패해도 로컬 로그아웃(persist(null))은 이미 끝났으니 조용히 무시 — 쿠키가 남아있으면
    // 다음 로그인 때 새 토큰으로 어차피 덮어써진다.
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, [persist]);

  return (
    <AuthContext.Provider
      value={{ user: auth?.user ?? null, token: auth?.token ?? null, loading, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
