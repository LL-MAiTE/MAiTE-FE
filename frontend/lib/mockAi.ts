import { MatchResult, NUMBER_CONFIRMATION_TIMEOUT_SECONDS, Position } from "./types";
import { FIELD_LABELS } from "./labels";

/**
 * ⚠️ MOCK AI 로직 — 실제 OpenAI 호출을 하지 않는 키워드 기반 휴리스틱이다.
 *
 * 실시간 라이브 화면의 "질문 시뮬레이션" 입력이, 실제 AI 호출(/api/match-intent)이
 * 실패했을 때만 쓰는 안전망이다(lib/store.tsx의 askQuestion 참고) — 데모가 API 키
 * 문제 등으로 완전히 끊기지 않게 하기 위함이지, 가짜 데이터를 보여주는 용도가 아니다.
 * 실제 판단 품질이 검증된 로직은 `../ai-core/src/matchIntentOrHold.ts`에 있다.
 *
 * (문서 근거로 안건 초안을 만드는 mock 함수가 예전에 여기 같이 있었는데, 실제
 * ai-core/generateDraftPositions.ts + 백엔드 문서 API로 완전히 대체돼서 지웠다.)
 */

const CONTAINS_NUMBER_REGEX = /\d/;

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
