import type { Metadata } from "next";
import Link from "next/link";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "특기전력 — AI 비동기 협업 대리 진행",
  description: "답변 작성자가 사전 승인한 내용만 AI가 상대방에게 대리 전달하는 서비스 (프론트엔드 스캐폴드)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <StoreProvider>
          <header className="site-header">
            <div className="site-header-inner">
              <Link href="/" className="site-brand">
                특기전력
                <span className="site-brand-sub">AI 비동기 협업 대리 진행</span>
              </Link>
            </div>
          </header>
          <main className="container">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
