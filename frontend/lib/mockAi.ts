import {
  ConfidenceLevel,
  MatchResult,
  NUMBER_CONFIRMATION_TIMEOUT_SECONDS,
  Position,
  PositionField,
  ProjectDocument,
} from "./types";
import { FIELD_LABELS } from "./labels";

/**
 * ⚠️ MOCK AI 로직 — 실제 OpenAI 호출을 하지 않는 키워드 기반 휴리스틱이다.
 *
 * 프론트엔드를 백엔드 없이 개발/데모하기 위한 임시 구현이며, 규칙(질문 성격에 맞는
 * 필드만 채우기, 근거 없으면 만들지 않기, 불확실하면 보류)의 "형태"만 흉내낸다.
 * 실제 판단 품질이 검증된 로직은 `../ai-core/src/generateDraftPositions.ts`와
 * `../ai-core/src/matchIntentOrHold.ts`에 있다 — 백엔드가 붙으면 이 파일의 두 함수를
 * 그 함수들을 호출하는 API 클라이언트 코드로 교체하면 된다 (입출력 타입은 동일하게 맞춰둠).
 */

const CONTAINS_NUMBER_REGEX = /\d/;

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

function extractFirstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?。]+[.!?。]?/);
  return (match ? match[0] : trimmed).trim();
}

interface DraftTemplate {
  keywords: string[];
  topic: string;
  questionText: string;
  fields: Partial<Record<PositionField, string | number>>;
  confidenceLevel: ConfidenceLevel;
}

// 문서 내용에 특정 키워드가 있으면 그에 맞는 안건 템플릿을 매칭시키는 아주 단순한 mock.
const TEMPLATES: DraftTemplate[] = [
  {
    keywords: ["마감일", "deadline"],
    topic: "api_deadline",
    questionText: "일정을 앞당기거나 늦출 수 있나요?",
    fields: {},
    confidenceLevel: "문서근거명확",
  },
  {
    keywords: ["가격", "인상", "price"],
    topic: "price_negotiation",
    questionText: "가격 조건을 조정할 수 있나요?",
    fields: {},
    confidenceLevel: "문서근거명확",
  },
  {
    keywords: ["계약", "contract"],
    topic: "contract_terms",
    questionText: "계약 조건 변경이 가능한가요?",
    fields: {},
    confidenceLevel: "추정",
  },
];

/**
 * 선택된 문서를 근거로 안건 초안을 만든다 (mock).
 * - isCoreContext=true 문서는 sourceDocumentTitle로 쓰지 않는다 (큰 틀 참고 목적).
 * - 근거 문서에서 날짜/수치가 보이면 concessionRange·dealbreaker 위주로,
 *   그렇지 않으면 answer 하나만 채우는 식으로 "질문 성격에 맞는 필드만" 흉내낸다.
 */
export function generateMockDraftPositions(
  documents: ProjectDocument[],
  _meetingTitle: string,
  _meetingPurpose: string
): Position[] {
  const referenceDocs = documents.filter((d) => !d.isCoreContext);
  const positions: Position[] = [];

  for (const doc of referenceDocs) {
    const lower = doc.content.toLowerCase();
    const template = TEMPLATES.find((t) =>
      t.keywords.some((k) => lower.includes(k.toLowerCase()))
    );

    if (!template) continue; // 근거 없는 안건은 만들지 않는다.

    const hasNumbers = CONTAINS_NUMBER_REGEX.test(doc.content);
    const sentence = extractFirstSentence(doc.content);

    const activeFields: PositionField[] = [];
    const base: Position = {
      id: nextId("pos"),
      topic: template.topic,
      version: 1,
      origin: "ai",
      approvalStatus: "초안",
      questionText: template.questionText,
      answer: null,
      preference: null,
      concessionRange: null,
      dealbreaker: null,
      priority: null,
      scheduleConstraint: null,
      activeFields: [],
      confidenceLevel: template.confidenceLevel,
      sourceDocumentTitle: doc.title,
      reasoning: `"${doc.title}"에서 "${template.keywords[0]}" 관련 내용을 찾아 생성 (mock).`,
    };

    if (hasNumbers) {
      base.concessionRange = sentence;
      activeFields.push("concessionRange");
    } else {
      base.answer = sentence;
      activeFields.push("answer");
    }
    base.activeFields = activeFields;

    // topic 중복 방지 (mock이라 단순하게 처리)
    if (!positions.some((p) => p.topic === base.topic)) {
      positions.push(base);
    }
  }

  return positions.slice(0, 6); // 규칙 4: 3~6개 정도로 생성
}

function buildResponseText(position: Position): string {
  const parts: string[] = [];
  if (position.answer) parts.push(position.answer);
  if (position.preference) parts.push(`선호안은 ${position.preference}입니다.`);
  if (position.concessionRange) parts.push(`다만 ${position.concessionRange}.`);
  if (position.dealbreaker) parts.push(`단, ${position.dealbreaker}는 어렵습니다.`);
  if (position.scheduleConstraint) parts.push(position.scheduleConstraint);
  return parts.length > 0 ? parts.join(" ") : "관련 승인 내용을 확인해주세요.";
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .replace(/[?.!,~。]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let common = 0;
  a.forEach((t) => {
    if (b.has(t)) common += 1;
  });
  return common;
}

/**
 * 실시간 질문을 승인된 안건과 매칭하거나 보류시킨다 (mock).
 * 표면적 키워드 overlap이 일정 수준을 넘고, questionText와 주제가 겹치는 경우에만
 * 매칭 처리한다 — 애매하면 항상 보류 쪽으로 기운다 (규칙 3 흉내).
 */
export function matchMockIntentOrHold(
  question: string,
  approvedPositions: Position[]
): MatchResult {
  const questionTokens = tokenize(question);

  let best: { position: Position; score: number } | null = null;
  for (const position of approvedPositions) {
    const score = overlapScore(questionTokens, tokenize(position.questionText));
    if (!best || score > best.score) {
      best = { position, score };
    }
  }

  const MIN_SCORE = 2; // 임계값을 보수적으로 잡아 "그럴듯하지만 불확실"한 매칭을 피함(mock)

  if (!best || best.score < MIN_SCORE) {
    return {
      matched: false,
      matchedTopic: null,
      intentMatchReasoning:
        "승인된 안건들과 핵심 키워드 overlap이 낮아 핵심 의도가 일치한다고 보기 어렵습니다.",
      responseText: null,
      containsCriticalNumber: false,
      limitationNote: null,
      holdReason:
        "승인된 안건 범위 안에서 확신 있게 답할 근거가 없어 안전하게 보류합니다 (mock).",
    };
  }

  const responseText = buildResponseText(best.position);
  const containsCriticalNumber = CONTAINS_NUMBER_REGEX.test(responseText);

  return {
    matched: true,
    matchedTopic: best.position.topic,
    intentMatchReasoning: `질문과 승인된 안건 "${best.position.questionText}"의 핵심 키워드가 겹쳐 매칭했습니다.`,
    responseText,
    containsCriticalNumber,
    limitationNote: best.position.dealbreaker
      ? `${FIELD_LABELS.dealbreaker}: ${best.position.dealbreaker}`
      : null,
    holdReason: null,
    ...(containsCriticalNumber
      ? {
          numberConfirmation: {
            status: "대기중" as const,
            secondsLeft: NUMBER_CONFIRMATION_TIMEOUT_SECONDS,
          },
        }
      : {}),
  };
}

function extractDayNumber(text: string): number | null {
  // "8/27", "8월 27일" 같은 표현에서 뒷자리(일)를 우선 뽑는다.
  const dateMatch = text.match(/(\d{1,2})\s*[/.\-월]\s*(\d{1,2})/);
  if (dateMatch) return Number(dateMatch[2]);
  const nums = text.match(/\d+/g);
  return nums ? Number(nums[nums.length - 1]) : null;
}

/**
 * 기능 7(승인 범위 내 대안 조율) mock 평가.
 * 상대방이 제안한 대안이 승인된 안건의 양보 가능 범위/양보 불가 사항 안에 있는지
 * 아주 단순한 숫자 비교로 판단한다. 숫자를 못 찾으면 자동 판단하지 않고 사람 확인을 요구한다.
 */
export function evaluateAlternativeMock(
  proposalText: string,
  position: Position
): { withinRange: boolean | null; note: string } {
  const proposedValue = extractDayNumber(proposalText);
  const cap =
    extractDayNumber(position.dealbreaker ?? "") ?? extractDayNumber(position.concessionRange ?? "");

  if (proposedValue === null || cap === null) {
    return {
      withinRange: null,
      note: "제안·승인 범위에서 비교할 숫자를 찾지 못했습니다. 답변 작성자가 직접 확인해주세요 (mock).",
    };
  }

  const withinRange = proposedValue <= cap;
  return {
    withinRange,
    note: withinRange
      ? `제안된 값(${proposedValue})이 승인된 범위(최대 ${cap}) 안에 있어 조율 가능합니다.`
      : `제안된 값(${proposedValue})이 양보 불가 한계(${cap})를 넘어 조율이 어렵습니다.`,
  };
}
