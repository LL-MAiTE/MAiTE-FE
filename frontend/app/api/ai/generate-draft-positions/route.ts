import { NextResponse } from "next/server";
import { generateDraftPositions } from "../../../../../ai-core/src/generateDraftPositions";
import type { GenerateDraftPositionsInput } from "../../../../../ai-core/src/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as GenerateDraftPositionsInput;

    if (
      !Array.isArray(input.documents) ||
      typeof input.meetingTitle !== "string" ||
      typeof input.meetingPurpose !== "string" ||
      typeof input.counterpartInfo !== "string"
    ) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const positions = await generateDraftPositions(input);
    return NextResponse.json({ positions });
  } catch (error) {
    console.error("[generate-draft-positions] 안건 생성 실패:", error);
    return NextResponse.json({ error: "AI 안건 생성에 실패했습니다." }, { status: 500 });
  }
}
