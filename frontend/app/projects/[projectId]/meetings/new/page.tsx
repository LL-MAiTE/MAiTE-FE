"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";

export default function NewMeetingPage({ params }: { params: { projectId: string } }) {
  const router = useRouter();
  const { getProject, createMeeting } = useStore();
  const project = getProject(params.projectId);

  const coreDocs = project?.documents.filter((d) => d.isCoreContext) ?? [];
  const otherDocs = project?.documents.filter((d) => !d.isCoreContext) ?? [];

  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [counterpartInfo, setCounterpartInfo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(coreDocs.map((d) => d.id));
  const [submitting, setSubmitting] = useState(false);

  if (!project) {
    return <EmptyState title="프로젝트를 찾을 수 없습니다" />;
  }

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSubmit = title.trim() && purpose.trim() && selectedIds.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const meeting = await createMeeting({
        projectId: project.id,
        title: title.trim(),
        purpose: purpose.trim(),
        counterpartInfo: counterpartInfo.trim(),
        selectedDocumentIds: selectedIds,
      });
      router.push(`/projects/${project.id}/meetings/${meeting.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/">프로젝트</Link> / <Link href={`/projects/${project.id}`}>{project.name}</Link> /
        새 회의
      </div>

      <div className="page-header">
        <h1>새 회의 만들기</h1>
        <p className="muted">
          이름·목적을 입력하고 관련 문서를 선택하면, 선택한 문서 범위 안에서 AI가 예상 안건과 답변
          초안을 만들어줍니다. 파일은 최소 1개 이상 선택해야 합니다 (핵심 맥락 md만 선택해도 무방).
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="field">
            <label htmlFor="meeting-title">회의 이름</label>
            <input
              id="meeting-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: API 마감일 협의"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="meeting-purpose">회의 목적</label>
            <textarea
              id="meeting-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="예: API 개발 일정 관련 최종 조율"
              rows={2}
            />
          </div>
          <div className="field">
            <label htmlFor="meeting-counterpart">상대방 정보</label>
            <input
              id="meeting-counterpart"
              type="text"
              value={counterpartInfo}
              onChange={(e) => setCounterpartInfo(e.target.value)}
              placeholder="국가, 언어, 소속 등 — 예: 사라 (미국 개발팀 리드, 영어 사용)"
            />
          </div>
        </Card>

        <Card>
          <h3>참고할 문서 선택 ({selectedIds.length}개 선택됨)</h3>

          {coreDocs.length > 0 && (
            <>
              <p className="muted">핵심 맥락 md (기본 포함)</p>
              <div className="checkbox-list" style={{ marginBottom: 12 }}>
                {coreDocs.map((doc) => (
                  <label key={doc.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                    />
                    <span>
                      <span className="checkbox-row-label">
                        {doc.title} <Badge tone="info">핵심 맥락 md</Badge>
                      </span>
                      <span className="checkbox-row-desc">{doc.content.slice(0, 80)}…</span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <p className="muted">그 외 문서</p>
          {otherDocs.length === 0 ? (
            <EmptyState
              title="선택할 문서가 없습니다"
              description="먼저 프로젝트 문서함에 문서를 추가해주세요."
            />
          ) : (
            <div className="checkbox-list">
              {otherDocs.map((doc) => (
                <label key={doc.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                  />
                  <span>
                    <span className="checkbox-row-label">{doc.title}</span>
                    <span className="checkbox-row-desc">{doc.content.slice(0, 80)}…</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </Card>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {submitting ? "AI 안건 초안 생성 중…" : "AI 안건 초안 생성"}
          </button>
          <Link href={`/projects/${project.id}`} className="btn btn-ghost">
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
