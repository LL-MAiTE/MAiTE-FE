import type { ApprovedPosition } from "../../ai-core/src/types";

/**
 * 백엔드(Spring Boot, LL-MAiTE/MAiTE-BE)의 GET /meetings/:id/positions를 호출해서
 * 실제 승인된 안건 스냅샷을 가져온다. 우리(프론트) Agora 통합은 그대로 쓰되
 * (asr/tts/Custom LLM 다 검증된 설정), 데이터만 백엔드 실 DB에서 읽어오게 하는 다리 역할.
 *
 * BACKEND_BASE_URL / BACKEND_API_TOKEN이 .env.local에 없으면 그냥 undefined를 반환해서
 * 호출부가 기존 로컬 파일 스냅샷/데모 데이터로 자연스럽게 폴백하게 한다.
 *
 * ⚠️ BACKEND_API_TOKEN은 지금은 테스트용으로 발급한 고정 JWT(만료 7일)를 쓴다 —
 * 실제 서비스에서는 프론트 로그인 흐름과 연결된 토큰으로 교체해야 한다.
 */

interface BackendMeetingPosition {
  topic: string;
  questionText: string;
  answer: string | null;
  preference: string | null;
  concessionRange: string | null;
  dealbreaker: string | null;
  priority: number | null;
  scheduleConstraint: string | null;
}

interface BackendListResponse {
  success: boolean;
  data?: BackendMeetingPosition[];
  message?: string;
}

function mapToApprovedPosition(p: BackendMeetingPosition): ApprovedPosition {
  return {
    topic: p.topic,
    questionText: p.questionText,
    answer: p.answer,
    preference: p.preference,
    concessionRange: p.concessionRange,
    dealbreaker: p.dealbreaker,
    priority: p.priority,
    scheduleConstraint: p.scheduleConstraint,
    activeFields: [],
    confidenceLevel: "문서근거명확",
    sourceDocumentTitle: null,
    reasoning: "",
    approvalStatus: "승인",
  };
}

export async function fetchBackendMeetingPositions(
  meetingId: string
): Promise<ApprovedPosition[] | undefined> {
  const baseUrl = process.env.BACKEND_BASE_URL;
  const token = process.env.BACKEND_API_TOKEN;
  if (!baseUrl || !token) return undefined;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/meetings/${meetingId}/positions`, {
      headers: { Authorization: `Bearer ${token}` },
      // Agora가 실시간으로 부르는 경로라 캐시되면 안 됨
      cache: "no-store",
    });
    if (!res.ok) return undefined;

    const body: BackendListResponse = await res.json();
    if (!body.success || !Array.isArray(body.data)) return undefined;

    return body.data.map(mapToApprovedPosition);
  } catch {
    // 백엔드 연결 실패는 조용히 폴백 — Agora 응답 경로 자체를 막으면 안 됨
    return undefined;
  }
}
