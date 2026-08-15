import { generateDraftPositions } from "./src/generateDraftPositions";
import { matchIntentOrHold } from "./src/matchIntentOrHold";
import { ApprovedPosition, PositionDraft, SourceDocument } from "./src/types";

function section(title: string) {
  const line = "=".repeat(70);
  console.log(`\n${line}\n${title}\n${line}`);
}

function printJson(label: string, value: unknown) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(value, null, 2));
}

// ---------------------------------------------------------------------------
// 테스트용 문서 데이터
// ---------------------------------------------------------------------------
const documents: SourceDocument[] = [
  {
    title: "project-overview.md",
    isCoreContext: true,
    content:
      "본 프로젝트는 한국 팀(PM: 재현)과 미국 개발팀(리드: 사라)이 공동 진행하는 " +
      "B2B SaaS 대시보드 개발 프로젝트입니다. 두 팀은 13시간 시차가 있어 실시간 회의를 " +
      "잡기 어렵습니다. 현재 스프린트 목표는 API 1차 버전 완성입니다.",
  },
  {
    title: "schedule-agreement.md",
    isCoreContext: false,
    content:
      "API 개발 마감일은 8월 25일로 합의되었습니다. 내부적으로는 상황에 따라 8월 28일까지는 " +
      "여유가 있다고 판단하고 있으나, 이 여유분은 외부에 먼저 공개하지 않고 협상 카드로 " +
      "남겨둘 것. 8월 28일을 넘기는 것은 불가합니다 (다음 마일스톤 일정과 직결).",
  },
  {
    title: "sprint-notes-0728.md",
    isCoreContext: false,
    content:
      "7/28 스프린트 회의 메모: QA 인력 관련 논의 없었음. 계약 기간 연장 관련 논의도 없었음. " +
      "현재 스코프는 API 개발까지만 포함, 계약서상 명시된 협업 기간은 별도 계약 문서를 " +
      "따름 (이 문서엔 구체적 언급 없음).",
  },
];

async function main() {
  section("STEP 1. generateDraftPositions 호출 — 안건 초안 생성");

  printJson("입력 문서 목록", documents);
  const meetingInfo = {
    meetingTitle: "API 마감일 협의",
    meetingPurpose: "API 개발 일정 관련 최종 조율",
    counterpartInfo: "사라 (미국 개발팀 리드, 영어 사용)",
  };
  printJson("회의 정보", meetingInfo);

  const draftPositions: PositionDraft[] = await generateDraftPositions({
    documents,
    ...meetingInfo,
  });

  printJson("generateDraftPositions 결과", draftPositions);
  console.log(`\n생성된 안건 개수: ${draftPositions.length}`);

  section("STEP 2. 'API 마감일' 관련 안건을 승인 처리");

  // "마감일" 관련 안건을 찾아 승인됐다고 가정 (topic/questionText에 마감/deadline 키워드 포함)
  const deadlinePosition = draftPositions.find(
    (p) =>
      p.topic.toLowerCase().includes("deadline") ||
      p.topic.includes("마감") ||
      p.questionText.includes("마감")
  );

  if (!deadlinePosition) {
    console.error(
      "⚠️  마감일 관련 안건을 찾지 못했습니다. draftPositions 출력을 확인하고 " +
        "찾는 조건을 수정해주세요."
    );
    process.exit(1);
  }

  const approvedPositions: ApprovedPosition[] = [
    { ...deadlinePosition, approvalStatus: "승인" },
  ];

  printJson("승인된 안건 (approvedPositions)", approvedPositions);

  section("STEP 3. matchIntentOrHold 테스트 — 실시간 질문 3개");

  const questions = [
    {
      label: "Q1 (매칭되어야 함 — 마감일 연장 질문)",
      text: "API 마감일 3일만 당길 수 있나요?",
    },
    {
      label: "Q2 (보류되어야 함 — 계약 기간 질문, 문서 근거 없음)",
      text: "그럼 계약 기간도 같이 늘려야 하나요?",
    },
    {
      label: "Q3 (보류되어야 함 — QA 인력 질문, 문서 근거 없음)",
      text: "혹시 QA 인력도 추가로 필요할까요?",
    },
  ];

  for (const q of questions) {
    section(q.label);
    console.log(`질문: "${q.text}"`);

    const result = await matchIntentOrHold({
      question: q.text,
      approvedPositions,
    });

    printJson("matchIntentOrHold 결과", result);

    console.log(
      `\n[검증] matched=${result.matched}, containsCriticalNumber=${result.containsCriticalNumber}`
    );
  }

  section("테스트 완료");
}

main().catch((err) => {
  console.error("\n❌ 테스트 실행 중 오류 발생:");
  console.error(err);
  process.exit(1);
});
