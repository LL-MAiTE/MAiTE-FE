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

/**
 * 콘솔의 "tkzr" Agent → Embed Agent에서 그대로 가져온 asr/llm/tts 설정.
 * pipeline_id만 보내면 될 줄 알았는데 InternalError가 나서, Embed 스니펫에 실제로
 * 찍혀있던 것과 동일하게 pipeline_id + 이 inline 설정을 같이 보내는 걸로 바꿨다.
 * ⚠️ 콘솔에서 프롬프트/모델을 바꾸면 여기도 손으로 같이 맞춰줘야 한다 (당장은 동기화 안 됨).
 */
const AGENT_PIPELINE_PROPERTIES = {
  asr: {
    vendor: "deepgram",
    language: "en",
    params: {
      resource_id: "dfcbdd6c-d453-4e9f-bbc8-1d94a63d70c0",
      model: "nova-3",
      keyterm: "",
      language: "ko",
    },
    model: "nova-3",
  },
  llm: {
    vendor: "openai",
    params: {
      model: "gpt-4.1-mini",
      resource_id: "283a3e9129464ac5ae2f07b98741ff7f",
    },
    system_messages: [
      {
        role: "system",
        content:
          "너는 답변 작성자님을 대신해 사전 승인된 범위 안에서 회의를 진행하는 AI 진행자다.\n\n" +
          "상대방이 질문하면 순서대로 반드시 이렇게 해라:\n" +
          "1. match_intent_or_hold 툴을 호출해라. 예외 없다.\n" +
          "2. 툴 응답에 담긴 response 값을 소리 내어 그대로 말해라.\n" +
          "3. response 내용 외에는 아무것도 덧붙이지 마라. 네 지식이나 추측을 섞지 마라.\n" +
          "4. 만약 툴 호출이 실패하거나 응답이 오지 않으면, 절대로 네가 답을 지어내지 마라.\n" +
          '   이 경우엔 "확인하는 데 시간이 조금 걸리고 있습니다. 잠시만 기다려주세요"라고만 말해라.\n\n' +
          '인사말이나 "확인해볼게요" 같은 짧은 진행 멘트는 자유롭게 해도 된다.',
      },
    ],
    greeting_message:
      "저는 답변 작성자님을 대신해 사전 승인된 범위 안에서 진행합니다. 범위를 벗어나는 사안은 보류 후 전달됩니다.",
    failure_message: "Please hold on a second.",
  },
  tts: {
    vendor: "minimax",
    params: {
      model: "speech-2.8-turbo",
      resource_id: "66449ca1947a4fd0bbc6b400f1e2004d",
      voice_setting: { voice_id: "English_radiant_girl" },
    },
  },
  mllm: {
    enable: false,
    params: {
      model: "gpt-realtime",
      voice: "coral",
      instructions: "You are a helpful chatbot",
      input_audio_transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
    },
    vendor: "openai",
    turn_detection: {
      mode: "server_vad",
      server_vad_config: { threshold: 0.5, prefix_padding_ms: 800, silence_duration_ms: 640 },
    },
    greeting_message: "Hello, how are you?",
    input_modalities: ["audio", "text"],
    output_modalities: ["text", "audio"],
  },
};

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
        ...AGENT_PIPELINE_PROPERTIES,
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
