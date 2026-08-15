"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";
import { Badge, MeetingStatusBadge } from "@/components/Badge";

export default function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  const { getProject, getMeetingsByProject, addDocument } = useStore();
  const project = getProject(params.projectId);
  const meetings = getMeetingsByProject(params.projectId);

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isCoreContext, setIsCoreContext] = useState(false);

  const recentSummary = useMemo(() => {
    if (!project || project.documents.length === 0) return null;
    const sorted = [...project.documents].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return sorted.slice(0, 3).map((d) => d.title);
  }, [project]);

  if (!project) {
    return (
      <EmptyState title="프로젝트를 찾을 수 없습니다" description="목록으로 돌아가 다시 시도해주세요." />
    );
  }

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    addDocument(project.id, { title: title.trim(), content: content.trim(), isCoreContext });
    setTitle("");
    setContent("");
    setIsCoreContext(false);
    setShowUpload(false);
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/">프로젝트</Link> / {project.name}
      </div>

      <div className="page-header page-header-row">
        <div>
          <h1>{project.name}</h1>
          {project.description && <p className="muted">{project.description}</p>}
        </div>
        <Link href={`/projects/${project.id}/meetings/new`} className="btn btn-primary">
          + 새 회의 만들기
        </Link>
      </div>

      <section className="section">
        <div className="section-header">
          <h2>문서함 ({project.documents.length}개)</h2>
          <button className="btn btn-sm" onClick={() => setShowUpload((v) => !v)}>
            + 문서 추가
          </button>
        </div>

        {recentSummary && (
          <p className="notice-banner">
            {project.documents.length}개 문서를 연동했습니다. 최근 수정 파일: {recentSummary.join(", ")}
          </p>
        )}

        {showUpload && (
          <Card>
            <form onSubmit={handleUpload}>
              <div className="field">
                <label htmlFor="doc-title">문서 제목</label>
                <input
                  id="doc-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: schedule-agreement.md"
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="doc-content">내용</label>
                <textarea
                  id="doc-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="md 내용을 붙여넣으세요 (해커톤 MVP는 직접 붙여넣기 / 이후 파일 업로드·Notion·Git 연동으로 대체)"
                  rows={5}
                />
              </div>
              <div className="field">
                <label className="checkbox-row" style={{ border: "none", padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={isCoreContext}
                    onChange={(e) => setIsCoreContext(e.target.checked)}
                  />
                  <span>
                    <span className="checkbox-row-label">프로젝트 핵심 맥락 md로 지정</span>
                    <span className="checkbox-row-desc">
                      회의 생성 시 항상 우선 노출되고, AI가 프로젝트 큰 틀을 잡을 때 항상 참고합니다.
                    </span>
                  </span>
                </label>
              </div>
              <div className="row">
                <button type="submit" className="btn btn-primary">
                  추가
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowUpload(false)}>
                  취소
                </button>
              </div>
            </form>
          </Card>
        )}

        {project.documents.length === 0 ? (
          <EmptyState
            title="아직 연동된 문서가 없습니다"
            description="핵심 맥락 md를 먼저 추가하면 AI가 프로젝트 큰 틀을 이해하는 데 도움이 됩니다."
          />
        ) : (
          <div className="stack">
            {project.documents.map((doc) => (
              <Card key={doc.id}>
                <div className="row-between">
                  <div>
                    <div className="row">
                      <strong>{doc.title}</strong>
                      {doc.isCoreContext && <Badge tone="info">핵심 맥락 md</Badge>}
                    </div>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {doc.content.slice(0, 120)}
                      {doc.content.length > 120 ? "…" : ""}
                    </p>
                  </div>
                  <span className="muted">{new Date(doc.updatedAt).toLocaleDateString("ko-KR")}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>회의 ({meetings.length}개)</h2>
        </div>
        {meetings.length === 0 ? (
          <EmptyState
            title="아직 만든 회의가 없습니다"
            description="회의 이름·목적을 입력하고 관련 문서를 선택하면 AI가 예상 안건을 준비해줍니다."
          />
        ) : (
          <div className="stack">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/projects/${project.id}/meetings/${meeting.id}`}
                className="card card-link"
              >
                <div className="row-between">
                  <div>
                    <strong>{meeting.title}</strong>
                    <p className="muted" style={{ marginTop: 2 }}>
                      {meeting.purpose}
                    </p>
                  </div>
                  <MeetingStatusBadge status={meeting.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
