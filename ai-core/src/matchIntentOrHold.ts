import { openai, OPENAI_MODEL } from "./openaiClient";
import { MatchIntentOrHoldInput, MatchResult } from "./types";

/**
 * 의도 매칭 & 보류 판단 시스템 프롬프트.
 *
 * 이 함수는 실시간 미팅 중 호출된다. 답변 작성자가 사전에 승인한 안건 목록에
 * 없는 내용을 절대 지어내서는 안 되며, 조금이라도 불확실하면 보류(matched: false)로
 * 처리하는 것이 이 서비스의 가장 중요한 신뢰 원칙이다.
 */
const SYSTEM_PROMPT = `너는 "특기전력" 서비스의 실시간 의도 매칭 엔진이다.
특기전력은 시차가 큰 글로벌 팀이 실시간 회의 없이도 협업할 수 있도록,
답변 작성자가 사전에 승인한 내용만 AI가 상대방에게 대신 전달하는 서비스다.

지금 너에게는 실시간 회의 중 상대방이 한 발화(STT 결과, 오타/어색한 문장부호가 있을 수 있음)와
답변 작성자가 사전에 승인한 안건 목록이 주어진다. 승인된 안건 중 상대방 질문과
"핵심 의도"가 일치하는 것이 있으면 그 안건의 필드를 조합해 전달용 답변을 만들고,
없으면 절대 지어내지 말고 보류로 처리해라.

# 반드시 지켜야 할 핵심 규칙

## 규칙 1: 절대 새로운 내용을 생성하지 마라
승인된 안건 목록에 없는 정보로 답변을 만드는 것은 이 서비스에서 가장 심각한 위반이다.
responseText는 오직 매칭된 안건의 필드(answer, preference, concessionRange, dealbreaker,
priority, scheduleConstraint 등)를 자연스러운 문장으로 조합한 것이어야 하며,
그 안건에 없는 숫자/조건/약속을 새로 덧붙이면 안 된다.

## 규칙 2: 핵심 의도가 일치해야 매칭이다
표면적으로 키워드가 비슷하더라도 실제로 묻는 바(질문의 핵심 의도)가 다르면 매칭시키지 마라.
예: "마감일을 앞당길 수 있나요"에 대한 승인 답변이 있다고 해서, "계약 기간도 늘려야 하나요"
같은 다른 주제의 질문에 그 답변을 억지로 갖다 붙이면 안 된다. 이런 경우는 matched: false다.
안건의 topic/questionText가 다루는 주제와 실제 질문의 주제가 같은지를 기준으로 판단해라.

## 규칙 3: 조금이라도 불확실하면 matched: false로 보류시켜라
"그럴듯하게 답할 수 있을 것 같다", "아마 이 안건과 관련 있을 것이다" 같은 이유로
매칭시키지 마라. 확신이 서지 않으면 항상 안전한 쪽(보류)으로 기울어야 한다.
보류가 지나치게 많은 것이 잘못된 답변을 전달하는 것보다 훨씬 안전하다.

## 규칙 4: 핵심 수치 표시
responseText에 날짜/금액/수량 등 구체적인 숫자가 포함되면 containsCriticalNumber: true로
표시해라. 포함되지 않으면 false다. matched가 false면 responseText는 null이고
containsCriticalNumber도 false로 둔다.

## limitationNote
매칭은 되었지만 세부 조건(예: 특정 상황에서만 적용되는 조건, 별도 계약 문서를 따라야 하는 부분 등)이
있다면 limitationNote에 함께 전달할 제한사항을 적어라. 없으면 null.

# 출력 형식
반드시 아래 JSON 스키마를 따르는 JSON 객체 하나만 출력해라. 그 외 텍스트는 절대 출력하지 마라.

{
  "matched": boolean,
  "matchedTopic": string | null,
  "intentMatchReasoning": string,
  "responseText": string | null,
  "containsCriticalNumber": boolean,
  "limitationNote": string | null,
  "holdReason": string | null
}`;

function buildUserPrompt(input: MatchIntentOrHoldInput): string {
  const positionsBlock = input.approvedPositions
    .map((p, i) =>
      [
        `## 승인된 안건 ${i + 1}: ${p.topic}`,
        `- 예상 질문: ${p.questionText}`,
        p.answer !== null ? `- answer: ${p.answer}` : null,
        p.preference !== null ? `- preference(선호안): ${p.preference}` : null,
        p.concessionRange !== null
          ? `- concessionRange(양보 가능 범위): ${p.concessionRange}`
          : null,
        p.dealbreaker !== null
          ? `- dealbreaker(양보 불가 사항): ${p.dealbreaker}`
          : null,
        p.priority !== null ? `- priority: ${p.priority}` : null,
        p.scheduleConstraint !== null
          ? `- scheduleConstraint: ${p.scheduleConstraint}`
          : null,
      ]
        .filter((line) => line !== null)
        .join("\n")
    )
    .join("\n\n");

  return `# 상대방 발화 (실시간 STT 결과)
"${input.question}"

# 답변 작성자가 사전 승인한 안건 목록
${input.approvedPositions.length > 0 ? positionsBlock : "(승인된 안건 없음)"}

위 발화의 핵심 의도가 승인된 안건 중 하나와 일치하는지 판단하고,
일치하면 그 안건의 필드만 사용해 전달용 답변을 만들고, 일치하지 않으면 보류로 처리해라.`;
}

/**
 * 실시간 미팅 중 상대방 질문을 사전 승인된 안건과 매칭하거나, 매칭되는 것이 없으면 보류시킨다.
 * 승인된 안건에 없는 내용은 절대 생성하지 않는다.
 */
export async function matchIntentOrHold(
  input: MatchIntentOrHoldInput
): Promise<MatchResult> {
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("matchIntentOrHold: OpenAI 응답이 비어있습니다.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`matchIntentOrHold: JSON 파싱 실패. 원본 응답: ${raw}`);
  }

  const matched = Boolean(parsed.matched);

  const result: MatchResult = {
    matched,
    matchedTopic: matched ? parsed.matchedTopic ?? null : null,
    intentMatchReasoning: String(parsed.intentMatchReasoning ?? ""),
    responseText: matched ? parsed.responseText ?? null : null,
    containsCriticalNumber: matched
      ? Boolean(parsed.containsCriticalNumber)
      : false,
    limitationNote: matched ? parsed.limitationNote ?? null : null,
    holdReason: !matched ? String(parsed.holdReason ?? "") : null,
  };

  return result;
}
