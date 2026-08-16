/**
 * Agora Conversational AI Agent를 RTC 채널에 join/leave시키는 REST API 클라이언트.
 * 콘솔(Agents → tkzr → Embed Agent)에서 확인한 실제 스펙 기준:
 *
 *   POST https://api.agora.io/api/conversational-ai-agent/v2/projects/{appId}/join
 *   POST https://api.agora.io/api/conversational-ai-agent/v2/projects/{appId}/agents/{agentId}/leave
 *
 * 인증은 Basic Auth(Customer ID:Customer Secret을 Base64) — AGORA_APP_ID/APP_CERTIFICATE와는
 * 완전히 별개의 자격증명이다. AGORA_CUSTOMER_ID/AGORA_CUSTOMER_SECRET 환경변수 필요.
 *
 * pipeline_id는 콘솔에 저장된 Agent 설정(프롬프트/모델/Custom Tool 연결)을 통째로 참조하는
 * 키라서, 여기서 프롬프트나 모델을 다시 지정할 필요가 없다 — 콘솔에서 Agent를 바꾸면
 * 자동으로 반영된다.
 */

const AGENT_API_BASE = "https://api.agora.io/api/conversational-ai-agent/v2";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}가 서버에 설정되어 있지 않습니다 (frontend/.env.local 확인).`);
  return value;
}

function basicAuthHeader(): string {
  const id = requireEnv("AGORA_CUSTOMER_ID");
  const secret = requireEnv("AGORA_CUSTOMER_SECRET");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export interface StartAgentParams {
  /** 이 Agent join 인스턴스를 식별할 이름 (보통 채널명 기반으로 지어줌) */
  name: string;
  channel: string;
  token: string;
  /** 채널 안에서 이 Agent의 uid. 사람 참여자 uid와 겹치지 않게 고정값 추천 (예: 9999) */
  agentRtcUid: string;
}

export interface StartAgentResult {
  agentId: string;
  status: string;
}

export async function startConversationalAgent(params: StartAgentParams): Promise<StartAgentResult> {
  const appId = requireEnv("AGORA_APP_ID");
  const pipelineId = requireEnv("AGORA_AGENT_PIPELINE_ID");
  const authHeader = basicAuthHeader();

  const res = await fetch(`${AGENT_API_BASE}/projects/${appId}/join`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      pipeline_id: pipelineId,
      properties: {
        channel: params.channel,
        token: params.token,
        agent_rtc_uid: params.agentRtcUid,
        remote_rtc_uids: ["*"], // 채널 안 모든 참가자의 발화를 들을 수 있게
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Agora join 실패 (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }

  return { agentId: data.agent_id, status: data.status };
}

export async function stopConversationalAgent(agentId: string): Promise<void> {
  const appId = requireEnv("AGORA_APP_ID");
  const authHeader = basicAuthHeader();

  const res = await fetch(`${AGENT_API_BASE}/projects/${appId}/agents/${agentId}/leave`, {
    method: "POST",
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agora leave 실패 (HTTP ${res.status}): ${text}`);
  }
}

export async function queryConversationalAgent(agentId: string): Promise<unknown> {
  const appId = requireEnv("AGORA_APP_ID");
  const authHeader = basicAuthHeader();

  const res = await fetch(`${AGENT_API_BASE}/projects/${appId}/agents/${agentId}`, {
    method: "GET",
    headers: { Authorization: authHeader },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Agora query 실패 (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}
