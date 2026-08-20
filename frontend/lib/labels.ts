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

/** 알림 종류(백엔드 NotificationType) → 한글 문구. 예전엔 "AUTO_CONFIRMED" 같은 enum
 * 원문을 그대로 화면에 띄우고 있었다. */
export const NOTIFICATION_LABELS: Record<string, string> = {
  HOLD_DELIVERED: "후속 답변이 상대방에게 전달됐습니다",
  HOLD_RECEIVED: "새 보류 항목이 등록됐습니다",
  REOPEN_REQUESTED: "상대방이 보류 항목을 다시 열었습니다",
  AUTO_CONFIRMED: "보류 항목이 시간 초과로 자동 확정됐습니다",
  NEEDS_REALTIME: "재오픈 상한 도달 — 실시간 조율이 필요합니다",
  MEETING_CLOSED: "회의의 모든 보류 항목이 종결됐습니다",
  PROJECT_INVITED: "프로젝트에 초대됐습니다",
};

/** referenceType(백엔드 원문) → 한글. 알림 부제로 "무엇에 대한" 알림인지 보여줄 때 쓴다. */
export const NOTIFICATION_REFERENCE_LABELS: Record<string, string> = {
  hold_item: "보류 항목",
  meeting_log: "회의 대화",
  meeting: "회의",
};

/** "방금 전" / "n분 전" / "n시간 전" 처럼 사람이 읽기 편한 상대 시각. 하루 넘게 지났으면
 * 그냥 날짜+시각을 보여준다(그때부턴 "며칠 전"이 오히려 덜 직관적이라). */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "방금 전";
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const date = new Date(iso);
  return date.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
