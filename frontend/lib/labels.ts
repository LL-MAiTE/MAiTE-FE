import { PositionField } from "./types";

/** 필드 이름 → 한글 라벨. UI와 mock AI 로직 양쪽에서 공용으로 사용. */
export const FIELD_LABELS: Record<PositionField, string> = {
  answer: "답변",
  preference: "선호안",
  concessionRange: "양보 가능 범위",
  dealbreaker: "양보 불가 사항",
  priority: "우선순위",
  scheduleConstraint: "일정 제약",
};
