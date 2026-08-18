"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";
import { MeetingStatusBadge } from "@/components/Badge";

const PROJECT_ICONS = ["📱", "🌐", "🚀", "💡", "🎨", "📊", "🔧", "🤖", "📡", "🔬", "🎯", "💼"];

const PROJECT_COLORS = [
  "linear-gradient(135deg, #9c5dfc 0%, #585ff5 100%)",
  "linear-gradient(135deg, #f472b6 0%, #a855f7 100%)",
  "linear-gradient(135deg, #60a5fa 0%, #6366f1 100%)",
  "linear-gradient(135deg, #34d399 0%, #059669 100%)",
  "linear-gradient(135deg, #fb923c 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #f87171 0%, #ec4899 100%)",
];

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
  const router = useRouter();
  const { projects, meetings, getMeetingsByProject, createProject } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [showMeetingProjectPicker, setShowMeetingProjectPicker] = useState(false);
  const [selectedMeetingProjectId, setSelectedMeetingProjectId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("🚀");
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    if (!showForm) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowForm(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showForm]);

  useEffect(() => {
    if (!showMeetingProjectPicker) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMeetingProjectPicker(false);
        setSelectedMeetingProjectId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMeetingProjectPicker]);

  const closeMeetingProjectPicker = () => {
    setShowMeetingProjectPicker(false);
    setSelectedMeetingProjectId(null);
  };

  const continueToNewMeeting = () => {
    if (!selectedMeetingProjectId) return;
    router.push(`/projects/${selectedMeetingProjectId}/meetings/new?from=home`);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProject(name.trim(), description.trim());
    setName("");
    setDescription("");
    setSelectedIcon("🚀");
    setSelectedColor(PROJECT_COLORS[0]);
    setInviteEmail("");
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
              <button className="btn btn-primary" onClick={() => setShowMeetingProjectPicker(true)}>
                <img src="/icons/icon-plus.svg" alt="" width={12} height={12} />새 회의 시작
              </button>
              <button className="btn quick-action-secondary" onClick={() => setShowForm(true)}>
                새 프로젝트 만들기
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
                    <span className="badge badge-info">진행 중</span>
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

      {showMeetingProjectPicker && (
        <div
          className="meeting-project-picker-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMeetingProjectPicker();
          }}
        >
          <section
            className="meeting-project-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-project-picker-title"
          >
            <header className="meeting-project-picker-header">
              <div>
                <h2 id="meeting-project-picker-title">회의를 시작할 프로젝트 선택</h2>
                <p>회의를 만들 프로젝트를 하나 선택해주세요.</p>
              </div>
              <button
                type="button"
                className="project-modal-close"
                onClick={closeMeetingProjectPicker}
                aria-label="프로젝트 선택 닫기"
              >
                <img src="/icons/project-modal-close.svg" alt="" width={16} height={16} />
              </button>
            </header>

            <div className="meeting-project-picker-body">
              {projects.length === 0 ? (
                <div className="meeting-project-picker-empty">
                  <span className="meeting-project-picker-empty-icon">📁</span>
                  <strong>먼저 프로젝트를 만들어주세요</strong>
                  <p>회의는 프로젝트 안에서 생성됩니다.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      closeMeetingProjectPicker();
                      setShowForm(true);
                    }}
                  >
                    프로젝트 만들기
                  </button>
                </div>
              ) : (
                <div className="meeting-project-options" role="radiogroup" aria-label="프로젝트 선택">
                  {projects.map((project) => {
                    const selected = selectedMeetingProjectId === project.id;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`meeting-project-option ${selected ? "selected" : ""}`}
                        onClick={() => setSelectedMeetingProjectId(project.id)}
                      >
                        <span className="meeting-project-option-icon">📁</span>
                        <span className="meeting-project-option-copy">
                          <strong>{project.name}</strong>
                          <span>{project.description || `문서 ${project.documents.length}개`}</span>
                        </span>
                        <span className="meeting-project-option-check">{selected ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {projects.length > 0 && (
              <footer className="meeting-project-picker-actions">
                <button type="button" className="btn" onClick={closeMeetingProjectPicker}>
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selectedMeetingProjectId}
                  onClick={continueToNewMeeting}
                >
                  다음
                </button>
              </footer>
            )}
          </section>
        </div>
      )}

      {showForm && (
        <div
          className="project-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowForm(false);
          }}
        >
          <section
            className="project-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
          >
            <header className="project-modal-header">
              <h2 id="new-project-title">새 프로젝트 만들기</h2>
              <button
                type="button"
                className="project-modal-close"
                onClick={() => setShowForm(false)}
                aria-label="새 프로젝트 만들기 닫기"
              >
                <img src="/icons/project-modal-close.svg" alt="" width={16} height={16} />
              </button>
            </header>

            <form className="project-modal-form" onSubmit={handleCreate}>
              <div className="project-modal-section">
                <label>아이콘 &amp; 색상</label>
                <div className="project-appearance-picker">
                  <div className="project-icon-preview" style={{ backgroundImage: selectedColor }}>
                    {selectedIcon}
                  </div>
                  <div className="project-appearance-options">
                    <div className="project-icon-options" aria-label="프로젝트 아이콘 선택">
                      {PROJECT_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          className={`project-icon-option ${selectedIcon === icon ? "selected" : ""}`}
                          onClick={() => setSelectedIcon(icon)}
                          aria-label={`${icon} 아이콘 선택`}
                          aria-pressed={selectedIcon === icon}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                    <div className="project-color-options" aria-label="프로젝트 색상 선택">
                      {PROJECT_COLORS.map((color, index) => (
                        <button
                          key={color}
                          type="button"
                          className="project-color-option"
                          style={{ backgroundImage: color }}
                          onClick={() => setSelectedColor(color)}
                          aria-label={`${index + 1}번 색상 선택`}
                          aria-pressed={selectedColor === color}
                        >
                          {selectedColor === color && (
                            <img src="/icons/project-modal-check.svg" alt="" width={11} height={11} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="project-modal-field">
                <label htmlFor="project-name">
                  프로젝트 이름 <span className="project-required">*</span>
                </label>
                <input
                  id="project-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: Mobile App 3.0"
                  maxLength={40}
                  autoFocus
                />
                <span className="project-name-count">{name.length}/40</span>
              </div>

              <div className="project-modal-field">
                <label htmlFor="project-desc">
                  프로젝트 설명 <span className="project-optional">(선택)</span>
                </label>
                <textarea
                  id="project-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="프로젝트 목표나 설명을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="project-modal-field">
                <label htmlFor="project-invite" className="project-invite-label">
                  <img src="/icons/project-modal-users.svg" alt="" width={11} height={11} />
                  팀원 초대 <span className="project-optional">(선택)</span>
                </label>
                <div className="project-invite-row">
                  <input
                    id="project-invite"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="이메일 주소 입력"
                  />
                  <button type="button" className="project-invite-button">
                    초대
                  </button>
                </div>
              </div>

              <div className="project-modal-actions">
                <button type="button" className="project-modal-cancel" onClick={() => setShowForm(false)}>
                  취소
                </button>
                <button type="submit" className="project-modal-submit" disabled={!name.trim()}>
                  프로젝트 만들기
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
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
