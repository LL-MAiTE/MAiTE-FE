"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";
import { Badge, MeetingStatusBadge } from "@/components/Badge";
import { PositionCard } from "@/components/PositionCard";
import { FIELD_LABELS } from "@/lib/labels";
import { Position, PositionField } from "@/lib/types";

interface BackendDocSummary {
  id: string;
  title: string;
  path: string | null;
  isCoreContext: boolean;
}

const ALL_FIELDS: PositionField[] = [
  "answer",
  "preference",
  "concessionRange",
  "dealbreaker",
  "priority",
  "scheduleConstraint",
];

export default function MeetingDetailPage({
  params,
}: {
  params: { projectId: string; meetingId: string };
}) {
  const router = useRouter();
  const {
    getProject,
    getMeeting,
    regenerateDraftPositions,
    setPositionApproval,
    updatePosition,
    addUserPosition,
    startLiveMeeting,
    deleteMeeting,
  } = useStore();

  const project = getProject(params.projectId);
  const meeting = getMeeting(params.meetingId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [regeneratingDrafts, setRegeneratingDrafts] = useState(false);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);
  const [backendDocs, setBackendDocs] = useState<BackendDocSummary[]>([]);

  useEffect(() => {
    if (!project) return;
    fetch(`/api/backend/documents?projectId=${project.id}`)
      .then((res) => res.json())
      .then((data) => setBackendDocs(data.documents ?? []))
      .catch(() => {
        // 연동 문서 목록은 옵셔널 — 실패해도 로컬 문서 선택은 그대로 동작
      });
  }, [project]);

  const activePositions = useMemo(
    () => meeting?.positions.filter((p) => p.approvalStatus !== "삭제됨") ?? [],
    [meeting]
  );
  const approvedCount = activePositions.filter(
    (p) => p.approvalStatus === "승인" || p.approvalStatus === "수정후승인"
  ).length;

  if (!project || !meeting) {
    return <EmptyState title="회의를 찾을 수 없습니다" />;
  }

  const handleStartLive = () => {
    startLiveMeeting(meeting.id);
    router.push(`/projects/${project.id}/meetings/${meeting.id}/live`);
  };

  const handleDelete = () => {
    if (!window.confirm(`"${meeting.title}" 회의를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    deleteMeeting(meeting.id);
    router.push(`/projects/${project.id}`);
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/">프로젝트</Link> / <Link href={`/projects/${project.id}`}>{project.name}</Link> /{" "}
        {meeting.title}
      </div>

      <div className="page-header page-header-row">
        <div>
          <div className="row">
            <h1 style={{ margin: 0 }}>{meeting.title}</h1>
            <MeetingStatusBadge status={meeting.status} />
          </div>
          <p className="muted">{meeting.purpose}</p>
          <p className="muted">상대방: {meeting.counterpartInfo}</p>
        </div>
        {meeting.status === "승인대기" && (
          <button className="btn btn-primary" disabled={approvedCount === 0} onClick={handleStartLive}>
            미팅 시작 ({approvedCount}개 안건 승인됨)
          </button>
        )}
        {(meeting.status === "라이브" ||
          meeting.status === "후속답변대기" ||
          meeting.status === "종료") && (
          <Link
            href={`/projects/${project.id}/meetings/${meeting.id}/${
              meeting.status === "라이브" ? "live" : "review"
            }`}
            className="btn btn-primary"
          >
            {meeting.status === "라이브" ? "라이브 화면으로" : "결과 검토로"}
          </Link>
        )}
        {meeting.status !== "라이브" && (
          <button type="button" className="btn btn-ghost" onClick={handleDelete}>
            삭제
          </button>
        )}
      </div>

      <section className="section">
        <div className="section-header">
          <h2>
            참고 문서 (
            {meeting.selectedDocumentIds.length + (meeting.selectedBackendDocumentIds?.length ?? 0)}개 선택됨)
          </h2>
          <button className="btn btn-sm" onClick={() => setShowDocPicker((v) => !v)}>
            파일 추가/제외
          </button>
        </div>

        {showDocPicker && (
          <Card>
            <div className="checkbox-list">
              {project.documents.map((doc) => {
                const checked = meeting.selectedDocumentIds.includes(doc.id);
                return (
                  <label key={doc.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={regeneratingDrafts}
                      onChange={async () => {
                        const next = checked
                          ? meeting.selectedDocumentIds.filter((id) => id !== doc.id)
                          : [...meeting.selectedDocumentIds, doc.id];
                        setRegeneratingDrafts(true);
                        setRegenerationError(null);
                        try {
                          await regenerateDraftPositions(
                            meeting.id,
                            next,
                            meeting.selectedBackendDocumentIds ?? []
                          );
                        } catch (error) {
                          setRegenerationError(
                            error instanceof Error ? error.message : "AI 안건 재생성에 실패했습니다."
                          );
                        } finally {
                          setRegeneratingDrafts(false);
                        }
                      }}
                    />
                    <span>
                      <span className="checkbox-row-label">
                        {doc.title} {doc.isCoreContext && <Badge tone="info">핵심 맥락 md</Badge>}
                      </span>
                    </span>
                  </label>
                );
              })}

              {backendDocs.map((doc) => {
                const checked = (meeting.selectedBackendDocumentIds ?? []).includes(doc.id);
                return (
                  <label key={doc.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={regeneratingDrafts}
                      onChange={async () => {
                        const current = meeting.selectedBackendDocumentIds ?? [];
                        const next = checked
                          ? current.filter((id) => id !== doc.id)
                          : [...current, doc.id];
                        setRegeneratingDrafts(true);
                        setRegenerationError(null);
                        try {
                          await regenerateDraftPositions(meeting.id, meeting.selectedDocumentIds, next);
                        } catch (error) {
                          setRegenerationError(
                            error instanceof Error ? error.message : "AI 안건 재생성에 실패했습니다."
                          );
                        } finally {
                          setRegeneratingDrafts(false);
                        }
                      }}
                    />
                    <span>
                      <span className="checkbox-row-label">
                        {doc.title} <Badge tone="neutral">연동</Badge>{" "}
                        {doc.isCoreContext && <Badge tone="info">핵심 맥락 md</Badge>}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="field-hint">
              선택을 바꾸면 아직 승인/수정되지 않은 AI 초안 안건만 새로 생성됩니다. 이미 승인했거나
              직접 추가한 안건은 유지됩니다.
            </p>
            {regeneratingDrafts && <p className="field-hint">AI 안건 초안을 다시 생성하고 있습니다…</p>}
            {regenerationError && <p className="field-hint">{regenerationError}</p>}
          </Card>
        )}

        <div className="row">
          {meeting.selectedDocumentIds.map((id) => {
            const doc = project.documents.find((d) => d.id === id);
            if (!doc) return null;
            return (
              <Badge key={id} tone={doc.isCoreContext ? "info" : "neutral"}>
                {doc.title}
              </Badge>
            );
          })}
          {(meeting.selectedBackendDocumentIds ?? []).map((id) => {
            const doc = backendDocs.find((d) => d.id === id);
            if (!doc) return null;
            return (
              <Badge key={id} tone={doc.isCoreContext ? "info" : "neutral"}>
                {doc.title} (연동)
              </Badge>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>안건 ({activePositions.length}개)</h2>
          <button className="btn btn-sm" onClick={() => setShowAddForm((v) => !v)}>
            + 직접 안건 추가
          </button>
        </div>

        {showAddForm && (
          <AddPositionForm
            onCancel={() => setShowAddForm(false)}
            onSubmit={(input) => {
              addUserPosition(meeting.id, input);
              setShowAddForm(false);
            }}
          />
        )}

        {activePositions.length === 0 ? (
          <EmptyState
            title="생성된 안건이 없습니다"
            description="선택한 문서에서 AI가 근거를 찾지 못했거나, 아직 직접 추가한 안건이 없습니다."
          />
        ) : (
          activePositions.map((position) =>
            editingId === position.id ? (
              <PositionEditForm
                key={position.id}
                position={position}
                onCancel={() => setEditingId(null)}
                onSave={(updates) => {
                  updatePosition(meeting.id, position.id, updates);
                  setPositionApproval(meeting.id, position.id, "수정후승인");
                  setEditingId(null);
                }}
              />
            ) : (
              <PositionCard
                key={position.id}
                position={position}
                footer={
                  meeting.status === "승인대기" ? (
                    <>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setPositionApproval(meeting.id, position.id, "승인")}
                      >
                        승인
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditingId(position.id)}>
                        수정 후 승인
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setPositionApproval(meeting.id, position.id, "반려")}
                      >
                        반려
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setPositionApproval(meeting.id, position.id, "삭제됨")}
                      >
                        삭제
                      </button>
                    </>
                  ) : null
                }
              />
            )
          )
        )}
      </section>
    </div>
  );
}

function AddPositionForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: {
    topic: string;
    questionText: string;
    fields: Partial<Record<PositionField, string | number>>;
  }) => void;
}) {
  const [topic, setTopic] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [enabledFields, setEnabledFields] = useState<PositionField[]>([]);
  const [values, setValues] = useState<Partial<Record<PositionField, string>>>({});

  const toggleField = (field: PositionField) => {
    setEnabledFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const canSubmit = topic.trim() && questionText.trim() && enabledFields.length > 0;

  return (
    <Card>
      <h3>직접 안건 추가</h3>
      <p className="muted">AI가 예상하지 못한 질문을 보완할 때 사용합니다. 관련 있는 필드만 체크하세요.</p>
      <div className="field">
        <label>주제 (topic, 버전관리용 식별자)</label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: escalation_contact"
        />
      </div>
      <div className="field">
        <label>예상 질문</label>
        <input
          type="text"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="예: 긴급 이슈 발생 시 누구에게 연락하면 되나요?"
        />
      </div>
      <div className="field">
        <label>채울 필드 선택</label>
        <div className="stack">
          {ALL_FIELDS.map((field) => (
            <label key={field} className="checkbox-row">
              <input
                type="checkbox"
                checked={enabledFields.includes(field)}
                onChange={() => toggleField(field)}
              />
              <span style={{ flex: 1 }}>
                <span className="checkbox-row-label">{FIELD_LABELS[field]}</span>
                {enabledFields.includes(field) && (
                  <input
                    type="text"
                    value={values[field] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
                    placeholder={`${FIELD_LABELS[field]} 내용`}
                    style={{ marginTop: 6 }}
                  />
                )}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              topic: topic.trim(),
              questionText: questionText.trim(),
              fields: Object.fromEntries(
                enabledFields.map((f) => [f, f === "priority" ? Number(values[f] ?? 0) : values[f] ?? ""])
              ),
            })
          }
        >
          추가 (자동 승인 처리)
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          취소
        </button>
      </div>
    </Card>
  );
}

function PositionEditForm({
  position,
  onCancel,
  onSave,
}: {
  position: Position;
  onCancel: () => void;
  onSave: (updates: Partial<Position>) => void;
}) {
  const [enabledFields, setEnabledFields] = useState<PositionField[]>(position.activeFields);
  const [values, setValues] = useState<Partial<Record<PositionField, string>>>(() => {
    const initial: Partial<Record<PositionField, string>> = {};
    ALL_FIELDS.forEach((f) => {
      const v = position[f];
      if (v !== null && v !== undefined) initial[f] = String(v);
    });
    return initial;
  });

  const toggleField = (field: PositionField) => {
    setEnabledFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const handleSave = () => {
    const updates: Partial<Position> = { activeFields: enabledFields };
    ALL_FIELDS.forEach((f) => {
      if (enabledFields.includes(f)) {
        updates[f] = (f === "priority" ? Number(values[f] ?? 0) : values[f] ?? "") as never;
      } else {
        updates[f] = null as never;
      }
    });
    onSave(updates);
  };

  return (
    <Card>
      <h3>안건 수정 — {position.topic}</h3>
      <p className="muted">{position.questionText}</p>
      <div className="stack">
        {ALL_FIELDS.map((field) => (
          <label key={field} className="checkbox-row">
            <input
              type="checkbox"
              checked={enabledFields.includes(field)}
              onChange={() => toggleField(field)}
            />
            <span style={{ flex: 1 }}>
              <span className="checkbox-row-label">{FIELD_LABELS[field]}</span>
              {enabledFields.includes(field) && (
                <input
                  type="text"
                  value={values[field] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
                  style={{ marginTop: 6 }}
                />
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={handleSave}>
          저장 (수정 후 승인, v{position.version + 1})
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          취소
        </button>
      </div>
    </Card>
  );
}
