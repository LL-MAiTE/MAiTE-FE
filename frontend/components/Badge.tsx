type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "badge badge-neutral",
  info: "badge badge-info",
  success: "badge badge-success",
  warning: "badge badge-warning",
  danger: "badge badge-danger",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: BadgeTone }) {
  return <span className={TONE_CLASS[tone]}>{children}</span>;
}

const MEETING_STATUS_TONE: Record<string, BadgeTone> = {
  준비중: "neutral",
  승인대기: "warning",
  라이브: "danger",
  후속답변대기: "info",
  종료: "success",
};

export function MeetingStatusBadge({ status }: { status: string }) {
  return <Badge tone={MEETING_STATUS_TONE[status] ?? "neutral"}>{status}</Badge>;
}

const CONFIDENCE_TONE: Record<string, BadgeTone> = {
  문서근거명확: "success",
  추정: "warning",
};

export function ConfidenceBadge({ level }: { level: string }) {
  return <Badge tone={CONFIDENCE_TONE[level] ?? "neutral"}>{level}</Badge>;
}

const APPROVAL_TONE: Record<string, BadgeTone> = {
  초안: "neutral",
  승인: "success",
  수정후승인: "success",
  반려: "danger",
  삭제됨: "danger",
};

export function ApprovalStatusBadge({ status }: { status: string }) {
  return <Badge tone={APPROVAL_TONE[status] ?? "neutral"}>{status}</Badge>;
}

const HOLD_TONE: Record<string, BadgeTone> = {
  보류: "warning",
  후속답변대기: "info",
  확정: "success",
  실시간조율필요: "danger",
};

export function HoldStatusBadge({ status }: { status: string }) {
  return <Badge tone={HOLD_TONE[status] ?? "neutral"}>{status}</Badge>;
}
