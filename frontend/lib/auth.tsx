"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * 로그인/회원가입 상태 관리. 백엔드(MAiTE-BE)의 /auth/login, /auth/signup이 실제로
 * 존재해서(JWT 발급) 여기 붙였다 — /api/auth/* 라우트가 얇게 프록시한다.
 *
 * 발급받은 JWT + 사용자 정보를 localStorage(tkzr_auth_v1)에 그대로 저장한다. httpOnly
 * 쿠키가 더 안전하지만, 해커톤 데모 스코프에서는 lib/store.tsx가 이미 같은 방식으로
 * localStorage를 쓰고 있어 일관성을 맞췄다.
 *
 * ⚠️ 주의: 프로젝트/회의/문서 등 실제 백엔드 데이터 호출(lib/backendApi.ts)은 지금도
 * 고정 서비스 계정 토큰(BACKEND_API_TOKEN)을 그대로 쓴다 — 로그인은 "누가 접속했는지"만
 * 구분하고, 데이터 자체는 여전히 단일 테넌트로 동작한다 (사용자별 데이터 분리는 이번
 * 스코프 밖). [[tkzr-scope-decisions]]
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

  const logout = useCallback(() => persist(null), [persist]);

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
