import { NextRequest, NextResponse } from "next/server";
import { matchIntentOrHold } from "../../../../../ai-core/src/matchIntentOrHold";
import { getMeetingSnapshot } from "@/lib/meetingSnapshotStore";
import { DEMO_APPROVED_POSITIONS, GENERIC_HOLD_MESSAGE } from "@/lib/agoraDemoData";

export const runtime = "nodejs";

/**
 * Agora Conversational AI의 "Custom LLM" 엔드포인트. OpenAI Chat Completions API와
 * 프로토콜 호환이어야 한다 (요청/응답 모양, SSE streaming) — 실제 판단은 우리가 100% 직접
 * 통제한다: 요청이 오면 매 턴 ai-core/matchIntentOrHold를 실행해서 결과를 그대로
 * 스트리밍해서 돌려준다. LLM이 "툴을 부를지 말지"를 스스로 판단하게 두는 Custom Tool
 * 방식보다 신뢰 원칙(승인 안 된 내용은 절대 지어내지 않는다)을 더 강하게 보장한다 —
 * 우리가 만든 문장 외에는 애초에 나갈 방법이 없는 구조.
 *
 * lib/agoraAgentClient.ts가 Agent를 join시킬 때 이 URL을
 * `.../chat-completions?meetingId={실제 회의 id}` 형태로 넘긴다.
 */

interface OpenAiMessage {
  role: string;
  content: unknown;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join(" ");
  }
  return "";
}

function sseChunk(id: string, created: number, model: string, delta: Record<string, unknown>, finishReason: string | null) {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildSseStream(text: string, model: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(sseChunk(id, created, model, { role: "assistant", content: text }, null))
      );
      controller.enqueue(encoder.encode(sseChunk(id, created, model, {}, "stop")));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { model?: string; messages?: OpenAiMessage[]; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }

  // Agora Custom LLM 스펙: non-streaming 요청은 거절해야 한다.
  if (body.stream !== true) {
    return NextResponse.json({ error: "chat completions require streaming" }, { status: 400 });
  }

  const model = body.model ?? "match-intent-agent";
  const meetingId = req.nextUrl.searchParams.get("meetingId");

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const question = extractText(lastUserMessage?.content).trim();

  // eslint-disable-next-line no-console
  console.log(`[agora-tool/chat-completions] meetingId=${meetingId ?? "(없음)"} question="${question}"`);

  if (!question) {
    // 첫 인사말 등 실제 질문이 없는 턴 — 짧은 대기 문구로 스트림만 정상 종료.
    return new NextResponse(buildSseStream("", model), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  let responseText = GENERIC_HOLD_MESSAGE;

  if (!process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.log("[agora-tool/chat-completions] OPENAI_API_KEY 미설정 — 보류 문구로 폴백");
  } else {
    const snapshot = meetingId ? getMeetingSnapshot(meetingId) : undefined;
    const approvedPositions = snapshot ?? DEMO_APPROVED_POSITIONS;

    try {
      const result = await matchIntentOrHold({ question, approvedPositions });
      responseText = result.matched
        ? [result.responseText, result.limitationNote].filter(Boolean).join(" ")
        : GENERIC_HOLD_MESSAGE;

      // eslint-disable-next-line no-console
      console.log(`[agora-tool/chat-completions] matched=${result.matched} demoFallback=${!snapshot}`, {
        matchedTopic: result.matchedTopic,
        holdReason: result.holdReason,
        reasoning: result.intentMatchReasoning,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.log("[agora-tool/chat-completions] matchIntentOrHold 실패:", message);
    }
  }

  return new NextResponse(buildSseStream(responseText, model), {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
