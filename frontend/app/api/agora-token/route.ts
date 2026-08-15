import { NextRequest, NextResponse } from "next/server";
import { RtcRole, RtcTokenBuilder } from "agora-token";

export const runtime = "nodejs";

/**
 * POST /api/agora-token
 * body: { channelName: string, uid?: number, role?: "publisher" | "subscriber" }
 *
 * 클라이언트가 Agora RTC 채널에 join하기 전에 호출해서 단기 토큰을 발급받는다.
 * AGORA_APP_CERTIFICATE는 토큰 서명에만 쓰이고 응답에는 절대 포함하지 않는다 —
 * 클라이언트에는 join에 필요한 appId + token만 내려준다.
 *
 * 기능4(실시간 음성인식+화자분리)·기능5(AI 대리진행)의 기반이 되는 라우트.
 * uid는 채널 안에서 참가자를 구분하는 숫자 ID — 화자 라벨링(화자A/화자B(AI) 등)과
 * 매핑할 때 프론트에서 이 uid를 기준으로 화자를 식별하면 된다.
 */
export async function POST(req: NextRequest) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return NextResponse.json(
      {
        error:
          "AGORA_APP_ID / AGORA_APP_CERTIFICATE가 서버에 설정되어 있지 않습니다 (frontend/.env.local 확인).",
      },
      { status: 503 }
    );
  }

  let body: { channelName?: string; uid?: number; role?: "publisher" | "subscriber" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 바디가 JSON이 아닙니다." }, { status: 400 });
  }

  if (!body.channelName || !body.channelName.trim()) {
    return NextResponse.json({ error: "channelName이 필요합니다." }, { status: 400 });
  }

  const uid = typeof body.uid === "number" ? body.uid : 0; // 0이면 Agora SDK가 클라이언트에서 자동 배정
  const role = body.role === "subscriber" ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

  const tokenExpirationInSeconds = 3600; // 토큰 자체 만료 (1시간)
  const privilegeExpirationInSeconds = 3600; // 채널 join 권한 만료 (1시간)

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      body.channelName.trim(),
      uid,
      role,
      tokenExpirationInSeconds,
      privilegeExpirationInSeconds
    );

    return NextResponse.json({
      appId, // App ID는 비밀값이 아님 — 클라이언트가 join할 때 필요
      token,
      channelName: body.channelName.trim(),
      uid,
      expiresInSeconds: tokenExpirationInSeconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `토큰 생성 실패: ${message}` }, { status: 500 });
  }
}
