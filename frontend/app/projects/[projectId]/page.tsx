"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Card, EmptyState } from "@/components/Card";
import { Badge, MeetingStatusBadge } from "@/components/Badge";

/**
 * 프로젝트 상세 페이지. Figma "프로젝트_개요/회의/문서"(1:19158, 1:20172, 1:21186) 탭
 * 구조를 기반으로 만들었다.
 *
 * 디자인 원본의 "마일스톤"/"진행률"/"최근 활동"은 이 앱의 데이터 모델에 없는 개념이라
 * 그대로 베끼지 않고, 실제 store 데이터로 채울 수 있는 값으로 바꿨다:
 *  - "전체 진행률" → 종료된 회의 비율
 *  - 통계 카드 4개 → 문서/회의/진행 중 회의/완료 회의 실제 카운트
 *  - "마일스톤" 패널 → "회의 현황" (상태별 실제 분포)
 *  - "최근 활동" → "최근 문서" (프로젝트 문서 실데이터)
 *
 * "팀원"과 "문서 소스 연동 — Git"은 백엔드에 이미 구현돼 있어서(GET/POST members,
 * 실제 GitHub API 기반 sync) 실제로 연결했다. Notion 연동은 백엔드도 아직 stub이라
 * 비활성으로 남겨뒀다. 프로젝트는 로컬 mock이 원본이라, 이 두 기능을 처음 쓰는
 * 순간에만 백엔드에 대응 프로젝트를 만든다(lib/backendApi.ts의 ensureBackendProjectId).
 */

type Tab = "개요" | "회의" | "문서";

interface ProjectMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  ANSWERER: "답변 작성자",
  QUESTIONER: "질문 참여자",
  TEAM_MANAGER: "팀 매니저",
};

export default function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  const { getProject, getMeetingsByProject, addDocument, deleteMeeting } = useStore();
  const project = getProject(params.projectId);
  const meetings = getMeetingsByProject(params.projectId);

  const [tab, setTab] = useState<Tab>("개요");
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isCoreContext, setIsCoreContext] = useState(false);

  // 팀원
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("ANSWERER");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Git 연동
  const [showGitForm, setShowGitForm] = useState(false);
  const [gitRepo, setGitRepo] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [gitSyncing, setGitSyncing] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitResult, setGitResult] = useState<{ syncedCount: number; latestFiles: string[] } | null>(null);

  // 연동 문서(Git/Notion) 목록 — 백엔드에 실제로 동기화된 문서를 조회/삭제
  const [backendDocs, setBackendDocs] = useState<
    { id: string; title: string; path: string | null }[]
  >([]);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [docActionError, setDocActionError] = useState<string | null>(null);

  const fetchBackendDocuments = async (projectId: string) => {
    try {
      const res = await fetch(`/api/backend/documents?localProjectId=${projectId}`);
      const data = await res.json();
      if (res.ok) setBackendDocs(data.documents ?? []);
    } catch {
      // 이 섹션은 옵셔널(아직 연동 안 했으면 빈 목록) — 실패해도 조용히 넘어감
    }
  };

  useEffect(() => {
    if (project) fetchBackendDocuments(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const handleToggleDocPreview = async (docId: string) => {
    if (expandedDocId === docId) {
      setExpandedDocId(null);
      setExpandedContent(null);
      return;
    }
    setExpandedDocId(docId);
    setExpandedContent(null);
    setExpandedLoading(true);
    try {
      const res = await fetch(`/api/backend/documents/${docId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setExpandedContent(data.document?.content ?? "(내용 없음)");
    } catch (err) {
      setExpandedContent(`내용을 불러오지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExpandedLoading(false);
    }
  };

  const handleDeleteBackendDoc = async (docId: string) => {
    if (!confirm("이 문서를 삭제할까요?")) return;
    setDocActionError(null);
    try {
      const res = await fetch(`/api/backend/documents/${docId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBackendDocs((prev) => prev.filter((d) => d.id !== docId));
      if (expandedDocId === docId) {
        setExpandedDocId(null);
        setExpandedContent(null);
      }
    } catch (err) {
      setDocActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const fetchMembers = async (projectId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/backend/project-members?localProjectId=${projectId}`);
      const data = await res.json();
      if (res.ok) setMembers(data.members);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (project) fetchMembers(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const stats = useMemo(() => {
    const done = meetings.filter((m) => m.status === "종료").length;
    const inProgress = meetings.filter((m) => m.status === "라이브" || m.status === "후속답변대기").length;
    const waitingApproval = meetings.filter((m) => m.status === "승인대기").length;
    return { done, inProgress, waitingApproval, total: meetings.length };
  }, [meetings]);

  const progressPct = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

  const recentDocuments = useMemo(() => {
    if (!project) return [];
    return [...project.documents]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/backend/project-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localProjectId: project.id,
          projectName: project.name,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMembers((prev) => [...prev, data.member]);
      setInviteEmail("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  };

  const handleGitSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitRepo.trim() || !gitToken.trim()) return;
    setGitSyncing(true);
    setGitError(null);
    setGitResult(null);
    try {
      const res = await fetch("/api/backend/git-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localProjectId: project.id,
          projectName: project.name,
          repo: gitRepo.trim(),
          accessToken: gitToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setGitResult(data);
      setGitToken("");
      fetchBackendDocuments(project.id);
    } catch (err) {
      setGitError(err instanceof Error ? err.message : String(err));
    } finally {
      setGitSyncing(false);
    }
  };

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/">← 프로젝트 목록</Link>
      </div>

      <div className="project-hero">
        <div className="project-hero-top">
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            <div className="project-hero-icon">📁</div>
            <div>
              <span className="project-hero-badge">진행 중</span>
              <h1>{project.name}</h1>
              {project.description && <p className="project-hero-desc">{project.description}</p>}
            </div>
          </div>
          <Link href={`/projects/${project.id}/meetings/new`} className="btn btn-primary">
            + 새 회의 만들기
          </Link>
        </div>
        <div className="project-hero-progress-label">
          <span>완료 회의 비율</span>
          <strong>{progressPct}%</strong>
        </div>
        <div className="project-hero-progress-track">
          <div className="project-hero-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="project-stat-cards">
        <div className="project-stat-card">
          <span className="widget-icon-badge">
            <img src="/icons/icon-document.svg" alt="" width={16} height={16} />
          </span>
          <strong>{project.documents.length}</strong>
          <span>문서</span>
        </div>
        <div className="project-stat-card">
          <span className="widget-icon-badge">
            <img src="/icons/icon-video.svg" alt="" width={16} height={16} />
          </span>
          <strong>{meetings.length}</strong>
          <span>회의</span>
        </div>
        <div className="project-stat-card">
          <span className="widget-icon-badge">
            <img src="/icons/widget-trend.svg" alt="" width={14} height={14} />
          </span>
          <strong>{stats.inProgress}</strong>
          <span>진행 중 회의</span>
        </div>
        <div className="project-stat-card">
          <span className="widget-icon-badge">
            <img src="/icons/icon-check-circle.svg" alt="" width={16} height={16} />
          </span>
          <strong>{stats.done}</strong>
          <span>완료 회의</span>
        </div>
      </div>

      <div className="tab-list">
        {(["개요", "회의", "문서"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab-button ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
            type="button"
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "개요" && (
        <div className="two-col">
          <Card>
            <h3>회의 현황</h3>
            <div className="stack">
              <StatusRow label="승인대기" count={stats.waitingApproval} color="var(--tone-warning-fg)" />
              <StatusRow label="진행 중 (라이브·후속답변대기)" count={stats.inProgress} color="var(--tone-info-fg)" />
              <StatusRow label="종료" count={stats.done} color="var(--tone-success-fg)" />
            </div>
          </Card>
          <Card>
            <h3>최근 문서</h3>
            {recentDocuments.length === 0 ? (
              <p className="muted">아직 연동된 문서가 없습니다.</p>
            ) : (
              recentDocuments.map((doc) => (
                <div key={doc.id} className="row-between" style={{ padding: "6px 0" }}>
                  <span style={{ fontSize: 13 }}>
                    {doc.title} {doc.isCoreContext && <Badge tone="info">핵심</Badge>}
                  </span>
                  <span className="muted">{new Date(doc.updatedAt).toLocaleDateString("ko-KR")}</span>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {tab === "개요" && (
        <Card>
          <div className="row-between">
            <h3 style={{ margin: 0 }}>팀원 {membersLoading ? "" : `(${members.length}명)`}</h3>
          </div>
          <p className="field-hint" style={{ marginTop: -6 }}>
            초대하려는 사람이 백엔드에 먼저 회원가입돼 있어야 합니다.
          </p>
          <div className="stack" style={{ marginTop: 8 }}>
            {members.map((m) => (
              <div key={m.id} className="row-between">
                <span style={{ fontSize: 13 }}>
                  <strong>{m.userName}</strong> <span className="muted">{m.userEmail}</span>
                </span>
                <Badge tone="neutral">{ROLE_LABEL[m.role] ?? m.role}</Badge>
              </div>
            ))}
          </div>
          <form onSubmit={handleInvite} className="row" style={{ marginTop: 12 }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="초대할 사람 이메일"
              style={{ flex: 1 }}
              disabled={inviting}
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} disabled={inviting}>
              <option value="ANSWERER">답변 작성자</option>
              <option value="QUESTIONER">질문 참여자</option>
              <option value="TEAM_MANAGER">팀 매니저</option>
            </select>
            <button type="submit" className="btn btn-sm btn-primary" disabled={inviting || !inviteEmail.trim()}>
              {inviting ? "초대 중…" : "초대"}
            </button>
          </form>
          {inviteError && <p style={{ color: "var(--tone-danger-fg)", marginTop: 6 }}>{inviteError}</p>}
        </Card>
      )}

      {tab === "회의" && (
        <section>
          <div className="section-header">
            <h2>회의 목록 ({meetings.length}개)</h2>
            <Link href={`/projects/${project.id}/meetings/new`} className="btn btn-sm btn-primary">
              + 새 회의
            </Link>
          </div>
          {meetings.length === 0 ? (
            <EmptyState
              title="아직 만든 회의가 없습니다"
              description="회의 이름·목적을 입력하고 관련 문서를 선택하면 AI가 예상 안건을 준비해줍니다."
            />
          ) : (
            meetings.map((meeting) => (
              <Link key={meeting.id} href={`/projects/${project.id}/meetings/${meeting.id}`} className="list-row">
                <span className="list-row-icon">
                  <img src="/icons/icon-calendar.svg" alt="" width={16} height={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{meeting.title}</strong>
                  <p className="muted" style={{ margin: "2px 0 0" }}>
                    {new Date(meeting.createdAt).toLocaleDateString("ko-KR")} · {meeting.purpose}
                  </p>
                </div>
                <MeetingStatusBadge status={meeting.status} />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="회의 삭제"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.confirm(`"${meeting.title}" 회의를 삭제할까요? 되돌릴 수 없습니다.`)) {
                      deleteMeeting(meeting.id);
                    }
                  }}
                >
                  삭제
                </button>
              </Link>
            ))
          )}
        </section>
      )}

      {tab === "문서" && (
        <section>
          <Card>
            <div className="row-between">
              <div>
                <h3 style={{ marginBottom: 2 }}>문서 소스 연동</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Notion, Git 연동 또는 MD 파일을 직접 업로드하세요.
                </p>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setShowUpload((v) => !v)}>
                + 소스 추가
              </button>
            </div>

            <div className="source-option-grid" style={{ marginTop: 16 }}>
              <button className="source-option" disabled title="이번 스코프에서는 제외 (추후 지원 예정)">
                📓 Notion
              </button>
              <button
                type="button"
                className={`source-option ${showGitForm ? "active" : ""}`}
                onClick={() => setShowGitForm((v) => !v)}
              >
                🔗 Git / GitHub
              </button>
              <button
                type="button"
                className={`source-option ${showUpload ? "active" : ""}`}
                onClick={() => setShowUpload((v) => !v)}
              >
                📤 MD 붙여넣기
              </button>
            </div>

            {showGitForm && (
              <form onSubmit={handleGitSync} style={{ marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="git-repo">저장소 (owner/repo)</label>
                  <input
                    id="git-repo"
                    type="text"
                    value={gitRepo}
                    onChange={(e) => setGitRepo(e.target.value)}
                    placeholder="예: LL-MAiTE/MAiTE-FE"
                    disabled={gitSyncing}
                  />
                </div>
                <div className="field">
                  <label htmlFor="git-token">GitHub Personal Access Token</label>
                  <input
                    id="git-token"
                    type="password"
                    value={gitToken}
                    onChange={(e) => setGitToken(e.target.value)}
                    placeholder="repo 읽기 권한이 있는 토큰"
                    disabled={gitSyncing}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={gitSyncing || !gitRepo.trim() || !gitToken.trim()}
                >
                  {gitSyncing ? "동기화 중…" : "연동하고 동기화"}
                </button>
                {gitError && <p style={{ color: "var(--tone-danger-fg)", marginTop: 8 }}>{gitError}</p>}
                {gitResult && (
                  <p className="field-hint" style={{ marginTop: 8 }}>
                    {gitResult.syncedCount}개 파일 동기화됨: {gitResult.latestFiles.join(", ")}
                  </p>
                )}
              </form>
            )}

            {backendDocs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p className="field-hint" style={{ marginBottom: 8 }}>
                  연동 문서 ({backendDocs.length}개) — 클릭하면 내용을 볼 수 있어요
                </p>
                {docActionError && (
                  <p style={{ color: "var(--tone-danger-fg)", marginBottom: 8 }}>{docActionError}</p>
                )}
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {backendDocs.map((doc) => (
                    <li key={doc.id} className="card" style={{ padding: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleToggleDocPreview(doc.id)}
                          className="btn btn-sm btn-ghost"
                          style={{ flex: 1, textAlign: "left", justifyContent: "flex-start" }}
                        >
                          📄 {doc.title}
                          {doc.path && doc.path !== doc.title ? ` (${doc.path})` : ""}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteBackendDoc(doc.id)}
                        >
                          삭제
                        </button>
                      </div>
                      {expandedDocId === doc.id && (
                        <pre
                          style={{
                            marginTop: 8,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: 13,
                            maxHeight: 320,
                            overflowY: "auto",
                          }}
                        >
                          {expandedLoading ? "불러오는 중…" : expandedContent}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showUpload && (
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
                    placeholder="md 내용을 붙여넣으세요"
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
            )}
          </Card>

          <h3 style={{ marginTop: 20 }}>문서 목록 ({project.documents.length}개)</h3>
          <p className="field-hint" style={{ marginTop: -6 }}>
            ⭐ 표시 문서는 회의 생성 시 우선 노출됩니다
          </p>
          {project.documents.length === 0 ? (
            <EmptyState
              title="아직 연동된 문서가 없습니다"
              description="핵심 맥락 md를 먼저 추가하면 AI가 프로젝트 큰 틀을 이해하는 데 도움이 됩니다."
            />
          ) : (
            project.documents.map((doc) => (
              <Card key={doc.id}>
                <div className="row-between">
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <span className="list-row-icon">
                      <img src="/icons/icon-document.svg" alt="" width={16} height={16} />
                    </span>
                    <div>
                      <div className="row">
                        <strong>{doc.title}</strong>
                        {doc.isCoreContext && <Badge tone="info">핵심</Badge>}
                      </div>
                      <p className="muted" style={{ marginTop: 4 }}>
                        {doc.content.slice(0, 120)}
                        {doc.content.length > 120 ? "…" : ""}
                      </p>
                    </div>
                  </div>
                  <span className="muted">{new Date(doc.updatedAt).toLocaleDateString("ko-KR")}</span>
                </div>
              </Card>
            ))
          )}
        </section>
      )}
    </div>
  );
}

function StatusRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="row-between">
      <span className="row" style={{ gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
        {label}
      </span>
      <strong>{count}건</strong>
    </div>
  );
}
