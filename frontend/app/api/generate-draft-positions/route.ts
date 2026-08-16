import { NextRequest, NextResponse } from "next/server";
// ⚠️ A 담당 파일. ai-core/src/generateDraftPositions.ts를 직접 재사용한다 —
// 프롬프트/판단 로직의 유일한 원본(source of truth)은 ai-core 쪽에 남겨두고,
// 여기서는 실행만 담당한다 (프롬프트 튜닝은 ai-core/src/generateDraftPositions.ts에서).
// /api/match-intent(B 담당)와 동일한 패턴 — 구조 그대로 재사용함.
import { generateDraftPositions } from "../../../../ai-core/src/generateDraftPositions";
import type { SourceDocument } from "../../../../ai-core/src/types";

export const runtime = "nodejs";

/**
 * POST /api/generate-draft-positions
 * body: { documents: SourceDocument[], meetingTitle: string, meetingPurpose: string, counterpartInfo: string }
 *
 * 회의 생성 화면(lib/store.tsx의 createMeeting/regenerateDraftPositions)이 호출한다.
 * 서버에서만 OPENAI_API_KEY를 쓰므로 클라이언트에 키가 노출되지 않는다. 키가 없거나
 * 호출이 실패하면 클라이언트 쪽에서 mock 로직(generateMockDraftPositions)으로
 * 폴백하도록 설계했다 — 그래서 이 라우트는 실패 시 그냥 에러를 그대로 반환하면 된다
 * (여기서 자체적으로 지어내지 않음, matchIntentOrHold 라우트와 동일한 정신).
 */
export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 서버에 설정되어 있지 않습니다 (frontend/.env.local 확인)." },
      { status: 503 }
    );
  }

  let body: {
    documents?: SourceDocument[];
    meetingTitle?: string;
    meetingPurpose?: string;
    counterpartInfo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }

  if (
    !Array.isArray(body.documents) ||
    !body.meetingTitle ||
    !body.meetingPurpose ||
    typeof body.counterpartInfo !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "documents(배열), meetingTitle, meetingPurpose, counterpartInfo가 모두 필요합니다.",
      },
      { status: 400 }
    );
  }

  try {
    const positions = await generateDraftPositions({
      documents: body.documents,
      meetingTitle: body.meetingTitle,
      meetingPurpose: body.meetingPurpose,
      counterpartInfo: body.counterpartInfo,
    });
    return NextResponse.json({ positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `generateDraftPositions 호출 실패: ${message}` },
      { status: 502 }
    );
  }
}
