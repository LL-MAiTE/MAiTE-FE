"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";

/**
 * 프로젝트 목록 (전체 화면). 사이드바 "프로젝트" 항목이 예전엔 홈 대시보드의
 * `#projects` 섹션으로 스크롤만 시키는 링크였는데, pathname이 그대로 "/"라 nav
 * 하이라이트도 안 되고, 프로젝트가 0개일 땐 페이지 높이가 뷰포트보다 짧아서 스크롤
 * 자체가 일어나지 않아 클릭해도 눈에 보이는 반응이 전혀 없었다("버튼이 안 눌린다"는
 * 문의로 확인됨). "회의" 항목이 이미 `/meetings`라는 독립 페이지인 것과 똑같은
 * 패턴으로 맞춰서 이 페이지를 신설했다. 홈 대시보드의 "프로젝트 (N개)" 섹션은
 * 요약 미리보기로 그대로 둔다 — 이 페이지는 전체 관리용 목적지다.
 */
export default function ProjectsPage() {
  const { projects, getMeetingsByProject, createProject, deleteProject } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createProject(name.trim(), description.trim());
      setName("");
      setDescription("");
      setShowForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="page-header page-header-row">
        <div>
          <h1>프로젝트</h1>
          <p className="muted">진행 중인 프로젝트를 관리하고, 새 프로젝트를 시작하세요</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          + 새 프로젝트
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="project-name">프로젝트 이름</label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: B2B SaaS 대시보드 개발"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="project-desc">설명 (선택)</label>
              <textarea
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="프로젝트에 대한 짧은 메모"
              />
            </div>
            {createError && (
              <p className="field-hint" style={{ color: "var(--tone-danger-fg)" }}>
                {createError}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? "만드는 중…" : "만들기"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                취소
              </button>
            </div>
          </form>
        </Card>
      )}

      {projects.length === 0 ? (
        <EmptyState
          title="아직 프로젝트가 없습니다"
          description="새 프로젝트를 만들고 문서를 쌓기 시작하세요."
        />
      ) : (
        <div className="grid grid-2">
          {projects.map((project) => {
            const projectMeetings = getMeetingsByProject(project.id);
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="card card-link">
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <span className="widget-icon-badge" style={{ width: 40, height: 40, fontSize: 18 }}>
                    📁
                  </span>
                  <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                    <span className="badge badge-info">진행 중</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="프로젝트 삭제"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (
                          window.confirm(
                            `"${project.name}" 프로젝트를 삭제할까요? 딸린 회의 ${projectMeetings.length}건도 함께 삭제되며, 되돌릴 수 없습니다.`
                          )
                        ) {
                          try {
                            await deleteProject(project.id);
                          } catch (err) {
                            window.alert(err instanceof Error ? err.message : "프로젝트 삭제에 실패했습니다.");
                          }
                        }
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <h3 style={{ marginTop: 12 }}>{project.name}</h3>
                {project.description && <p className="muted">{project.description}</p>}
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="badge badge-neutral">문서 {project.documents.length}개</span>
                  <span className="badge badge-neutral">회의 {projectMeetings.length}개</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
