"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";

export default function ProjectListPage() {
  const { projects, getMeetingsByProject, createProject } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProject(name.trim(), description.trim());
    setName("");
    setDescription("");
    setShowForm(false);
  };

  return (
    <div>
      <div className="page-header page-header-row">
        <div>
          <h1>프로젝트</h1>
          <p className="muted">
            문서를 계속 쌓아두는 단위입니다. 프로젝트 안에서 회의를 만들고, 그 회의에서 쓸 문서를
            골라 AI가 안건 초안을 준비합니다.
          </p>
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
            <div className="row">
              <button type="submit" className="btn btn-primary">
                만들기
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
            const meetings = getMeetingsByProject(project.id);
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="card card-link">
                <h3>{project.name}</h3>
                {project.description && <p className="muted">{project.description}</p>}
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="badge badge-neutral">문서 {project.documents.length}개</span>
                  <span className="badge badge-neutral">회의 {meetings.length}개</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
