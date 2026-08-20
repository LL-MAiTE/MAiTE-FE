"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/Card";
import { Badge, ConfidenceBadge } from "@/components/Badge";
import { Meeting } from "@/lib/types";

interface BackendDocSummary {
  id: string;
  title: string;
  path: string | null;
  isCoreContext: boolean;
}

/**
 * 새 회의 만들기 — 5단계 위저드. Figma "새 회의 만들기 1~5"(1:2939, 1:4405, 1:5871,
 * 1:7337, 1:8803, 1:10269) 노드를 기반으로 만들었다.
 *
 * 디자인 원본은 홈 대시보드 위에 뜨는 모달이었지만, 이 라우트(`/projects/[id]/meetings/new`)는
 * 프로젝트 컨텍스트가 필요한 독립 페이지라서 모달 오버레이 대신 같은 카드 UI를 페이지
 * 형태로 옮겼다. "상대방" 스텝의 국가/언어 칩은 디자인에 있지만 이 앱의 데이터 모델은
 * 자유 텍스트 counterpartInfo 하나뿐이라, 칩 선택값 + 자유 입력을 조합해 그 문자열을
 * 만드는 식으로 실제 동작하게 연결했다. 5번째 "회의 예약하기" 모달(1:11735, 날짜/시간/
 * 참여자 수)은 이 앱에 회의 스케줄링 데이터 모델이 없어 그대로 베끼지 않고, 4번째 스텝의
 * "AI 안건 생성 완료" 결과 확인 화면으로 대체했다 (자세한 내용은 최종 보고 참고).
 */

const COUNTRIES = ["미국", "일본", "독일", "영국", "중국", "프랑스", "싱가포르"];
const LANGUAGES = ["영어", "일본어", "독일어", "중국어", "프랑스어"];

const STEPS = [
  { n: 1, label: "회의 정보" },
  { n: 2, label: "상대방" },
  { n: 3, label: "파일 선택" },
  { n: 4, label: "AI 생성" },
  { n: 5, label: "완료" },
] as const;

export default function NewMeetingPage({ params }: { params: { projectId: string } }) {
  const router = useRouter();
  const { getProject, getMeeting, createMeeting, regenerateDraftPositions } = useStore();
  const project = getProject(params.projectId);

  const coreDocs = project?.documents.filter((d) => d.isCoreContext) ?? [];
  const otherDocs = project?.documents.filter((d) => !d.isCoreContext) ?? [];

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [extraInfo, setExtraInfo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(coreDocs.map((d) => d.id));
  const [error, setError] = useState<string | null>(null);
  const [createdMeeting, setCreatedMeeting] = useState<Meeting | null>(null);

  // Git 연동으로 백엔드에 동기화된 문서 — 프로젝트 화면에서 직접 붙여넣은 로컬 문서와
  // 별개 출처라 목록도 따로 불러오고, 선택 상태도 따로 들고 있는다.
  const [backendDocs, setBackendDocs] = useState<BackendDocSummary[]>([]);
  const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>([]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    fetch(`/api/backend/documents?localProjectId=${project.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const docs: BackendDocSummary[] = data.documents ?? [];
        setBackendDocs(docs);
        setSelectedBackendIds(docs.filter((d) => d.isCoreContext).map((d) => d.id));
      })
      .catch(() => {
        // 연동 문서는 옵셔널 — 실패해도 로컬 문서만으로 계속 진행 가능
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!project) {
    return <EmptyState title="프로젝트를 찾을 수 없습니다" />;
  }

  const counterpartInfo = [country, language && `${language} 사용`, extraInfo.trim()]
    .filter(Boolean)
    .join(", ");

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleBackendDoc = (id: string) => {
    setSelectedBackendIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const totalSelectedCount = selectedIds.length + selectedBackendIds.length;

  const runGeneration = async () => {
    setError(null);
    setStep(4);
    try {
      if (!createdMeeting) {
        const meeting = await createMeeting({
          projectId: project.id,
          title: title.trim(),
          purpose: purpose.trim(),
          counterpartInfo,
          selectedDocumentIds: selectedIds,
          selectedBackendDocumentIds: selectedBackendIds,
        });
        setCreatedMeeting(meeting);
      } else {
        await regenerateDraftPositions(createdMeeting.id, selectedIds, selectedBackendIds);
        const refreshed = getMeeting(createdMeeting.id);
        if (refreshed) setCreatedMeeting(refreshed);
      }
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 안건 생성에 실패했습니다.");
      setStep(3);
    }
  };

  const latestPositions = createdMeeting?.positions ?? [];

  return (
    <div className="wizard-shell">
      <div className="breadcrumb">
        <Link href="/">프로젝트</Link> / <Link href={`/projects/${project.id}`}>{project.name}</Link> /
        새 회의
      </div>

      <div className="wizard-card">
        <div className="wizard-header">
          <h2 style={{ margin: 0 }}>새 회의 만들기</h2>
          <Link href={`/projects/${project.id}`} className="wizard-close" aria-label="닫기">
            ✕
          </Link>
        </div>

        <div className="stepper">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <div className="stepper-step">
                <div
                  className={`stepper-circle ${step > s.n ? "done" : step === s.n ? "current" : ""}`}
                >
                  {step > s.n ? "✓" : s.n}
                </div>
                <span className="stepper-label">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`stepper-line ${step > s.n ? "done" : ""}`} />
              )}
            </Fragment>
          ))}
        </div>

        {step === 1 && (
          <div>
            <div className="field">
              <label htmlFor="meeting-title">회의 이름 *</label>
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
                placeholder="이 회의에서 결정하거나 논의할 내용을 입력하세요"
                rows={3}
              />
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" disabled={!title.trim()} onClick={() => setStep(2)}>
                다음 →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="notice-banner">상대방 정보는 AI 안건 생성 및 다국어 통역에 활용됩니다</p>
            <div className="field">
              <label>상대방 국가</label>
              <div className="chip-group">
                {COUNTRIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${country === c ? "active" : ""}`}
                    onClick={() => setCountry(country === c ? null : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>상대방 언어</label>
              <div className="chip-group">
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`chip ${language === l ? "active" : ""}`}
                    onClick={() => setLanguage(language === l ? null : l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="extra-info">추가 정보 (선택)</label>
              <input
                id="extra-info"
                type="text"
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
                placeholder="예: 개발팀 리드, 13시간 시차"
              />
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => setStep(1)}>
                이전
              </button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>
                다음 →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="notice-banner">최소 1개 선택 필수. ⭐ 핵심 문서는 기본 선택 상태입니다.</p>
            {[...coreDocs, ...otherDocs].length === 0 && backendDocs.length === 0 ? (
              <EmptyState
                title="선택할 문서가 없습니다"
                description="먼저 프로젝트 문서함에 문서를 추가하거나 Git 연동을 해주세요."
              />
            ) : (
              <>
                {[...coreDocs, ...otherDocs].map((doc) => {
                  const selected = selectedIds.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`file-select-row ${selected ? "selected" : ""}`}
                      onClick={() => toggleDoc(doc.id)}
                    >
                      <span className="list-row-icon">
                        <img src="/icons/icon-document.svg" alt="" width={16} height={16} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div className="row">
                          <strong style={{ fontSize: 13 }}>{doc.title}</strong>
                          {doc.isCoreContext && <Badge tone="info">⭐ 핵심</Badge>}
                        </div>
                        <p className="muted" style={{ margin: "2px 0 0" }}>
                          {doc.content.slice(0, 60)}…
                        </p>
                      </div>
                      <span className="file-select-check">{selected ? "✓" : ""}</span>
                    </div>
                  );
                })}

                {backendDocs.length > 0 && (
                  <>
                    <p className="field-hint" style={{ marginTop: 12 }}>
                      연동 문서 (Git 동기화)
                    </p>
                    {backendDocs.map((doc) => {
                      const selected = selectedBackendIds.includes(doc.id);
                      return (
                        <div
                          key={doc.id}
                          className={`file-select-row ${selected ? "selected" : ""}`}
                          onClick={() => toggleBackendDoc(doc.id)}
                        >
                          <span className="list-row-icon">
                            <img src="/icons/icon-document.svg" alt="" width={16} height={16} />
                          </span>
                          <div style={{ flex: 1 }}>
                            <div className="row">
                              <strong style={{ fontSize: 13 }}>{doc.title}</strong>
                              {doc.isCoreContext && <Badge tone="info">⭐ 핵심</Badge>}
                            </div>
                            {doc.path && (
                              <p className="muted" style={{ margin: "2px 0 0" }}>
                                {doc.path}
                              </p>
                            )}
                          </div>
                          <span className="file-select-check">{selected ? "✓" : ""}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
            <p className="field-hint">{totalSelectedCount}개 선택됨</p>
            {error && <p className="field-hint" style={{ color: "var(--tone-danger-fg)" }}>{error}</p>}
            <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
              <button className="btn" onClick={() => setStep(2)}>
                이전
              </button>
              <button className="btn btn-primary" disabled={totalSelectedCount === 0} onClick={runGeneration}>
                AI 안건 생성 ✨
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="ai-generating">
            <div className="ai-generating-icon">✨</div>
            <h3>AI 안건 초안 생성 중…</h3>
            <p className="muted">선택한 {totalSelectedCount}개 문서를 분석하고 있습니다</p>
            <div className="ai-generating-checklist">
              <div className="ai-generating-checklist-item">📄 문서 파싱 및 맥락 분석</div>
              <div className="ai-generating-checklist-item">❓ 예상 질문 도출</div>
              <div className="ai-generating-checklist-item">✍️ 답변 초안 생성 (선호안·양보범위)</div>
            </div>
          </div>
        )}

        {step === 5 && createdMeeting && (
          <div>
            <div className="ai-generating" style={{ paddingBottom: 0 }}>
              <div className="ai-result-icon">✓</div>
              <h3>안건 초안 생성 완료!</h3>
              <p className="muted">{latestPositions.length}개 안건이 생성되었습니다. 검토 후 승인하세요.</p>
            </div>
            <div style={{ margin: "16px 0" }}>
              {latestPositions.slice(0, 4).map((p, i) => (
                <div className="ai-result-preview-row" key={p.id}>
                  <span>
                    {i + 1}. {p.questionText}
                  </span>
                  <ConfidenceBadge level={p.confidenceLevel} />
                </div>
              ))}
              {latestPositions.length > 4 && (
                <p className="muted" style={{ textAlign: "center", marginTop: 6 }}>
                  외 {latestPositions.length - 4}개 안건
                </p>
              )}
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => setStep(3)}>
                파일 재선택
              </button>
              <button
                className="btn btn-primary"
                onClick={() => router.push(`/projects/${project.id}/meetings/${createdMeeting.id}`)}
              >
                안건 검토하기 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
