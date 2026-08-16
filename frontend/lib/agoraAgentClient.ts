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
 * pipeline_id는 콘솔에 저장된 Agent 설정을 참조하는 키지만, `properties.llm`을 여기서
 * 직접 지정하면 그쪽이 우선한다. 처음엔 Studio의 "Custom Tool"(function-calling)로
 * match_intent_or_hold를 붙이려 했는데, REST `/join`으로 시작한 Agent는 Custom Tool을
 * 실제 함수로 인식하지 못하고 이름을 텍스트로 읽어버리는 문제가 있었다 — Agora REST 문서에
 * tools/function-calling 필드가 아예 없어서, Custom Tool은 Studio 콘솔 전용 기능으로 보인다.
 *
 * 그래서 LLM 자체를 우리 서버로 대체하는 "Custom LLM" 방식으로 바꿨다
 * (app/api/agora-tool/chat-completions/route.ts). Agora가 OpenAI 호환 포맷으로 우리
 * 엔드포인트를 호출하면, 우리가 매 턴 직접 matchIntentOrHold를 실행해서 결과를 스트리밍해
 * 돌려준다 — "LLM이 툴을 부를지 스스로 판단"하는 불확실성 자체를 없앤 구조.
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

/**
 * asr/tts는 콘솔 "tkzr" Agent의 Embed Agent 스니펫 기준(Deepgram/Minimax, Agora Managed Key)
 * 그대로 고정. llm만 channel(=meetingId)별로 우리 Custom LLM 엔드포인트를 가리키게 동적으로 만든다
 * — 그래야 /api/agora-tool/chat-completions가 어느 회의의 승인 데이터를 찾아야 하는지 안다.
 * ⚠️ 콘솔에서 ASR/TTS 모델을 바꾸면 여기도 손으로 같이 맞춰줘야 한다 (당장은 동기화 안 됨).
 */
function buildPipelineProperties(channel: string) {
  const publicBaseUrl = requireEnv("AGORA_PUBLIC_BASE_URL").replace(/\/$/, "");

  return {
    asr: {
      vendor: "deepgram",
      credential_mode: "managed", // Agora Managed Key로 자격증명 자동 해석 — 없으면 연결이 깨짐
      resource_id: "dfcbdd6c-d453-4e9f-bbc8-1d94a63d70c0", // 어떤 managed credential 쓸지 참조 —
      // params 안에 있으면 그대로 실제 API 요청에 섞여 들어가서 에러 나므로 밖에 둠.
      language: "en",
      params: {
        url: "wss://api.deepgram.com/v1/listen",
        model: "nova-3",
        keyterm: "",
        language: "ko",
      },
      model: "nova-3",
    },
    llm: {
      // vendor/credential_mode를 지정하지 않음 — Custom LLM 방식이라 우리 서버 url만 준다.
      url: `${publicBaseUrl}/api/agora-tool/chat-completions?meetingId=${encodeURIComponent(channel)}`,
      greeting_message:
        "저는 답변 작성자님을 대신해 사전 승인된 범위 안에서 진행합니다. 범위를 벗어나는 사안은 보류 후 전달됩니다.",
      failure_message: "확인하는 데 시간이 조금 걸리고 있습니다. 잠시만 기다려주세요.",
    },
    tts: {
      vendor: "minimax",
      credential_mode: "managed",
      resource_id: "66449ca1947a4fd0bbc6b400f1e2004d",
      params: {
        url: "wss://api.minimax.io/ws/v1/t2a_v2",
        model: "speech-2.8-turbo",
        voice_setting: { voice_id: "English_radiant_girl" },
      },
    },
  };
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
        ...buildPipelineProperties(params.channel),
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
