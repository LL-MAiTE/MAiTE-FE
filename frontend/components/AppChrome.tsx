"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { AppShell } from "./AppShell";

const PUBLIC_PATHS = ["/login", "/signup"];

/**
 * 로그인 게이트. /login, /signup은 AppShell(탑바+사이드바) 없이 그대로 보여주고,
 * 그 외 모든 화면은 로그인한 사용자만 볼 수 있게 막는다 — 미로그인 상태로 들어오면
 * /login으로 보내고, 반대로 이미 로그인된 채로 /login·/signup에 들어오면 홈으로
 * 돌려보낸다.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { user, loading } = useAuth();
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPath) router.replace("/login");
    if (user && isPublicPath) router.replace("/");
  }, [loading, user, isPublicPath, router]);

  if (isPublicPath) return <>{children}</>;

  if (loading || !user) {
    return (
      <div className="auth-loading">
        <span className="app-brand-word">
          M<span className="grad">Ai</span>TE
        </span>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
