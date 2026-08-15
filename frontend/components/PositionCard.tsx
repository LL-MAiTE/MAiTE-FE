import { Position } from "@/lib/types";
import { FIELD_LABELS } from "@/lib/labels";
import { ApprovalStatusBadge, Badge, ConfidenceBadge } from "./Badge";
import { Card } from "./Card";

/**
 * 안건(Position) 하나를 보여주는 카드. activeFields에 있는 필드만 표시한다 —
 * "질문 성격에 맞는 필드만 채운다"는 규칙을 화면에서도 그대로 지키기 위함.
 */
export function PositionCard({
  position,
  footer,
}: {
  position: Position;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="position-card">
      <div className="position-card-header">
        <div>
          <div className="position-card-topic">
            {position.topic} <span className="muted">v{position.version}</span>
          </div>
          <div className="position-card-question">{position.questionText}</div>
        </div>
        <div className="position-card-badges">
          <ApprovalStatusBadge status={position.approvalStatus} />
          <ConfidenceBadge level={position.confidenceLevel} />
          {position.origin === "user" && <Badge tone="info">직접 추가</Badge>}
        </div>
      </div>

      <dl className="position-card-fields">
        {position.activeFields.length === 0 && (
          <p className="muted">채워진 필드가 없습니다.</p>
        )}
        {position.activeFields.map((field) => (
          <div key={field} className="position-card-field-row">
            <dt>{FIELD_LABELS[field]}</dt>
            <dd>{String(position[field] ?? "")}</dd>
          </div>
        ))}
      </dl>

      <div className="position-card-meta">
        <span>
          근거 문서: {position.sourceDocumentTitle ?? "직접 입력 (문서 근거 없음)"}
        </span>
      </div>
      <details className="position-card-reasoning">
        <summary>AI 판단 근거 (디버깅용)</summary>
        <p>{position.reasoning}</p>
      </details>

      {footer && <div className="position-card-footer">{footer}</div>}
    </Card>
  );
}
