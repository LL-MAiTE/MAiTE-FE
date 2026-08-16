import { RtcRole, RtcTokenBuilder } from "agora-token";

/**
 * 서버 전용 RTC 토큰 생성 헬퍼. `/api/agora-token`(사람 참여자용)과
 * `/api/agora-agent/start`(AI Agent를 채널에 join시킬 때) 양쪽에서 같이 쓴다.
 * AGORA_APP_CERTIFICATE는 여기서만 다루고 절대 응답으로 내보내지 않는다.
 */
export function buildRtcToken(
  channelName: string,
  uid: number,
  role: "publisher" | "subscriber" = "publisher",
  expirationSeconds = 3600
): { appId: string; token: string } {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    throw new Error("AGORA_APP_ID / AGORA_APP_CERTIFICATE가 서버에 설정되어 있지 않습니다.");
  }

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    role === "subscriber" ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER,
    expirationSeconds,
    expirationSeconds
  );

  return { appId, token };
}
