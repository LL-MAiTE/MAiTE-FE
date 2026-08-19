"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";
import { MeetingStatusBadge } from "@/components/Badge";

/**
 * 홈 대시보드. Figma "홈 대시보드"(1:7) 노드를 기반으로 만들었다.
 *
 * 디자인 원본은 공지사항/내 소식/예정된 회의/AI 어시스턴트 활성 등 이 앱의 데이터
 * 모델에 없는 위젯을 포함하고 있었다. 없는 데이터를 지어내는 대신, 같은 카드 패턴을
 * 실제 store 데이터로 채울 수 있는 형태로 바꿔서 반영했다 (자세한 내용은 최종 보고 참고):
 *  - "공지사항" → "최근 문서 업데이트" (프로젝트 문서함 실데이터)
 *  - "내 소식"   → "최근 회의" (실제 생성된 회의 목록)
 *  - "현황 요약" → 회의 상태별 실제 카운트
 *  - "예정된 회의" / "MAiTE Pro 업그레이드" / "AI 어시스턴트 활성"은 대응하는 데이터·기능이
 *    없어 이번 스코프에서 제외했다.
 */
export default function HomeDashboardPage() {
  const { projects, meetings, getMeetingsByProject, createProject, deleteProject } = useStore();
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

  const stats = useMemo(
    () => ({
      live: meetings.filter((m) => m.status === "라이브").length,
      done: meetings.filter((m) => m.status === "종료").length,
      waiting: meetings.filter((m) => m.status === "후속답변대기").length,
      projects: projects.length,
    }),
    [meetings, projects]
  );

  const recentDocuments = useMemo(() => {
    const all = projects.flatMap((p) => p.documents.map((d) => ({ ...d, projectName: p.name })));
    return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5);
  }, [projects]);

  const recentMeetings = useMemo(
    () =>
      [...meetings]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [meetings]
  );

  return (
    <div>
      <div className="page-header">
        <h1>대시보드</h1>
        <p className="muted">안녕하세요, 재현님! 오늘도 효율적인 협업을 시작해보세요 👋</p>
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <Card>
            <div className="widget-card-header">
              <span className="widget-card-title">
                <span className="widget-icon-badge">
                  <img src="/icons/widget-trend.svg" alt="" width={14} height={14} />
                </span>
                현황 요약
              </span>
              <span className="muted">이번 달 기준</span>
            </div>
            <div className="stat-ring-grid">
              <StatRing value={stats.live} label="진행 중인 회의" color="#b47ffe" />
              <StatRing value={stats.done} label="완료된 회의" color="#585ff5" />
              <StatRing value={stats.waiting} label="대기 중 응답" color="#f59e0b" />
              <StatRing value={stats.projects} label="총 프로젝트" color="#34d399" />
            </div>
          </Card>

          <Card>
            <div className="widget-card-header">
              <span className="widget-card-title">
                <span className="widget-icon-badge">
                  <img src="/icons/widget-notice.svg" alt="" width={14} height={14} />
                </span>
                최근 문서 업데이트
              </span>
            </div>
            {recentDocuments.length === 0 ? (
              <p className="muted">아직 연동된 문서가 없습니다.</p>
            ) : (
              recentDocuments.map((doc) => (
                <div key={doc.id} className="feed-row">
                  <span className="feed-row-tag badge-info" style={{ background: "var(--tone-info-bg)", color: "var(--tone-info-fg)" }}>
                    {doc.projectName}
                  </span>
                  <div className="row-between" style={{ flex: 1 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{doc.title}</strong>
                      {doc.isCoreContext && <span className="muted"> · 핵심 맥락 md</span>}
                    </div>
                    <span className="muted">{new Date(doc.updatedAt).toLocaleDateString("ko-KR")}</span>
                  </div>
                </div>
              ))
            )}
          </Card>

          <Card>
            <div className="widget-card-header">
              <span className="widget-card-title">
                <span className="widget-icon-badge">
                  <img src="/icons/icon-calendar.svg" alt="" width={14} height={14} />
                </span>
                최근 회의
              </span>
            </div>
            {recentMeetings.length === 0 ? (
              <p className="muted">아직 만든 회의가 없습니다.</p>
            ) : (
              recentMeetings.map((m) => {
                const project = projects.find((p) => p.id === m.projectId);
                return (
                  <Link
                    key={m.id}
                    href={`/projects/${m.projectId}/meetings/${m.id}`}
                    className="feed-row"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div className="row-between" style={{ flex: 1 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>{m.title}</strong>
                        <p className="muted" style={{ margin: "2px 0 0" }}>
                          {project?.name} · {m.purpose}
                        </p>
                      </div>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <MeetingStatusBadge status={m.status} />
                        <span className="muted">{new Date(m.createdAt).toLocaleDateString("ko-KR")}</span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <div className="widget-card-header">
              <span className="widget-card-title">빠른 작업</span>
            </div>
            <div className="quick-action-list">
              <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
                <img src="/icons/icon-plus.svg" alt="" width={12} height={12} />새 프로젝트
              </button>
            </div>
          </Card>

          <div className="tip-card">
            <div className="row" style={{ gap: 8 }}>
              <img src="/icons/widget-tip.svg" alt="" width={16} height={16} />
              <strong>알아두면 좋은 점</strong>
            </div>
            <ol>
              <li>AI는 답변 작성자가 승인한 안건 범위 안에서만 대리 진행합니다.</li>
              <li>숫자·금액·일정처럼 핵심 수치가 포함된 답변은 상대방에게 O/X로 재확인합니다.</li>
            </ol>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <h2>프로젝트 ({projects.length}개)</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setShowForm((v) => !v)}>
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
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `"${project.name}" 프로젝트를 삭제할까요? 딸린 회의 ${projectMeetings.length}건도 함께 삭제되며, 되돌릴 수 없습니다.`
                            )
                          ) {
                            deleteProject(project.id);
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
      </section>
    </div>
  );
}

function StatRing({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="stat-ring">
      <div className="stat-ring-circle" style={{ borderColor: color }}>
        <strong>{value}</strong>
        <span>건</span>
      </div>
      <div className="stat-ring-label">{label}</div>
    </div>
  );
}
