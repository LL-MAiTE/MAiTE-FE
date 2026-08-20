"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/authContext";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, name);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark">
            <Image src="/brand/maite-logo-mark.png" alt="" width={64} height={64} unoptimized />
          </span>
          <span className="auth-brand-word">
            M<span className="grad">Ai</span>TE
          </span>
        </div>

        <h1 className="auth-title">회원가입</h1>
        <p className="auth-subtitle muted">MAiTE 계정을 만들어 시작하세요.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="name">이름</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              autoComplete="new-password"
              required
            />
            <p className="field-hint">영문, 숫자 포함 8자 이상을 권장합니다.</p>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? "가입 중…" : "회원가입"}
          </button>
        </form>

        <p className="auth-footer-text muted">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="auth-link">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
