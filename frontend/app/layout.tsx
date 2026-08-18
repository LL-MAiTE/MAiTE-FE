import type { Metadata } from "next";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAiTE — AI 비동기 협업 대리 진행",
  description: "답변 작성자가 사전 승인한 내용만 AI가 상대방에게 대리 전달하는 서비스 (특기전력 해커톤 프로젝트)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
