import { openai, OPENAI_MODEL } from "./openaiClient";
import {
  GenerateDraftPositionsInput,
  PositionDraft,
  PositionField,
  ConfidenceLevel,
} from "./types";

const ACTIVE_FIELD_NAMES: PositionField[] = [
  "answer",
  "preference",
  "concessionRange",
  "dealbreaker",
  "priority",
  "scheduleConstraint",
];

/**
 * 안건 초안 생성 시스템 프롬프트.
 *
 * 이 함수의 목적은 "답변 작성자가 확인·승인만 하면 되는" 초안을 만드는 것이므로,
 * 문서에 없는 내용을 지어내거나, 질문 성격과 무관한 필드까지 습관적으로 채우는 것을
 * 절대 허용하지 않는다. 이 두 가지가 이 기능의 신뢰를 결정한다.
 */
const SYSTEM_PROMPT = `너는 "특기전력" 서비스의 안건 초안 생성 엔진이다.
특기전력은 시차가 큰 글로벌 팀이 실시간 회의 없이도 협업할 수 있도록,
답변 작성자가 사전에 승인한 내용만 AI가 상대방에게 대신 전달하는 서비스다.

너의 역할은 답변 작성자가 업로드한 문서를 근거로, 다가올 회의에서 상대방이 물어볼 만한
"예상 질문(안건)"과 그에 대한 "답변 초안"을 미리 만들어 두는 것이다.
답변 작성자는 이 초안을 확인하고 승인/수정만 하면 된다. 즉 너의 결과물은 최종 발화가 아니라
사람이 검토할 "초안"이라는 점을 항상 명심해라.

# 반드시 지켜야 할 핵심 규칙

## 규칙 1: 질문 성격에 맞는 필드만 채워라
안건마다 필드 성격이 다르다.
- 일정/기한 관련 질문 → preference, concessionRange, scheduleConstraint 위주로 채운다.
- 계약/조건/범위 관련 질문 → dealbreaker(양보 불가 사항)까지 포함해서 채운다.
- 우선순위가 문서에서 드러나는 경우에만 priority를 숫자로 채운다.
- 단순 사실 확인성 질문이면 answer 하나만 채우고 나머지는 비워도 된다.
해당 안건과 무관한 필드는 반드시 null로 남겨두고, activeFields 배열에도 그 필드 이름을
절대 포함시키지 마라. 모든 필드를 습관적으로 다 채우는 것은 이 기능의 핵심 규칙 위반이다.
"혹시 몰라서" 채우는 필드가 있어서는 안 된다.

## 규칙 2: 문서에 없는 내용은 추정하지 말고 만들지 마라
- 문서에 직접적이고 명확한 근거가 있으면 confidenceLevel: "문서근거명확".
- 문서에 직접적 근거는 없지만 문맥상 합리적으로 추론 가능한 경우에만 confidenceLevel: "추정".
  이 경우 reasoning에 어떤 문맥에서 추론했는지 반드시 밝혀라.
- 근거가 전혀 없는 안건은 만들지 마라. "그럴듯해 보이는" 질문을 지어내는 것 자체가 금지다.
  차라리 안건 개수가 적어지는 것이 낫다.

## 규칙 3: 핵심 맥락 문서는 큰 틀만 잡는 데 쓴다
문서 중 isCoreContext=true로 표시된 문서는 팀 구성, 프로젝트 목적, 배경 같은
"큰 틀"을 이해하는 데에만 참고해라. 구체적인 답변 근거(날짜, 조건, 수치, 합의사항 등)는
반드시 isCoreContext=false인 다른 문서에서 찾아야 한다. 핵심 맥락 문서의 내용을
sourceDocumentTitle로 지정하지 마라 (큰 틀 참고 목적일 뿐, 구체 근거가 아니다).

## 규칙 4: 안건은 3~6개 정도로만 생성해라
너무 많이 만들지 말고, 회의 목적과 가장 관련 있고 근거가 명확한 안건 위주로 선별해라.

# 출력 형식
반드시 아래 JSON 스키마를 따르는 JSON 객체 하나만 출력해라. 그 외 텍스트는 절대 출력하지 마라.

{
  "positions": [
    {
      "topic": string,              // 버전관리용 식별자, snake_case 영문 권장. 예: "api_deadline"
      "questionText": string,       // 예상 질문
      "answer": string | null,
      "preference": string | null,
      "concessionRange": string | null,
      "dealbreaker": string | null,
      "priority": number | null,
      "scheduleConstraint": string | null,
      "activeFields": string[],     // ["answer","preference","concessionRange","dealbreaker","priority","scheduleConstraint"] 중 실제로 값을 채운 것만
      "confidenceLevel": "문서근거명확" | "추정",
      "sourceDocumentTitle": string | null,
      "reasoning": string
    }
  ]
}`;

function buildUserPrompt(input: GenerateDraftPositionsInput): string {
  const coreDocs = input.documents.filter((d) => d.isCoreContext);
  const otherDocs = input.documents.filter((d) => !d.isCoreContext);

  const formatDoc = (d: { title: string; content: string }) =>
    `### ${d.title}\n${d.content}`;

  return `# 회의 정보
- 회의 이름: ${input.meetingTitle}
- 회의 목적: ${input.meetingPurpose}
- 상대방 정보: ${input.counterpartInfo}

# 핵심 맥락 문서 (큰 틀 참고용 — 구체적 답변 근거로 쓰지 말 것)
${coreDocs.length > 0 ? coreDocs.map(formatDoc).join("\n\n") : "(없음)"}

# 그 외 참고 문서 (구체적 답변 근거는 여기서 찾을 것)
${otherDocs.length > 0 ? otherDocs.map(formatDoc).join("\n\n") : "(없음)"}

위 문서들을 근거로, 이번 회의에서 상대방이 물어볼 만한 안건 초안을 생성해라.`;
}

function normalizePositionDraft(raw: any): PositionDraft {
  const activeFields: PositionField[] = Array.isArray(raw.activeFields)
    ? raw.activeFields.filter((f: unknown): f is PositionField =>
        ACTIVE_FIELD_NAMES.includes(f as PositionField)
      )
    : [];

  const confidenceLevel: ConfidenceLevel =
    raw.confidenceLevel === "추정" ? "추정" : "문서근거명확";

  return {
    topic: String(raw.topic ?? ""),
    questionText: String(raw.questionText ?? ""),
    answer: raw.answer ?? null,
    preference: raw.preference ?? null,
    concessionRange: raw.concessionRange ?? null,
    dealbreaker: raw.dealbreaker ?? null,
    priority: typeof raw.priority === "number" ? raw.priority : null,
    scheduleConstraint: raw.scheduleConstraint ?? null,
    activeFields,
    confidenceLevel,
    sourceDocumentTitle: raw.sourceDocumentTitle ?? null,
    reasoning: String(raw.reasoning ?? ""),
  };
}

/**
 * 문서를 근거로 예상 질문(안건) + 답변 초안을 생성한다.
 * 답변 작성자가 확인·승인하기 전 단계의 "초안"이다.
 */
export async function generateDraftPositions(
  input: GenerateDraftPositionsInput
): Promise<PositionDraft[]> {
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("generateDraftPositions: OpenAI 응답이 비어있습니다.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `generateDraftPositions: JSON 파싱 실패. 원본 응답: ${raw}`
    );
  }

  const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
  return positions.map(normalizePositionDraft);
}
