/**
 * ⚠️ 클라이언트 전용 모듈 (브라우저에서만 동작).
 *
 * agora-rtc-sdk-ng는 getUserMedia 등 브라우저 API에 의존한다. Next.js는 클라이언트
 * 컴포넌트도 최초 1회는 서버에서 렌더링(SSR)하기 때문에, 이 SDK를 파일 최상단에서
 * 정적으로 import하면 서버 렌더링 단계에서 깨질 수 있다. 그래서 실제 SDK는 connect()
 * 안에서 동적 import(브라우저에서 실제로 버튼을 눌렀을 때만 실행)로 불러온다.
 *
 * 기능4(실시간 음성인식+화자분리)의 기반 — "실제 RTC 채널에 join해서 오디오를 주고
 * 받는다"까지만 담당한다. Real-Time STT(전사/화자분리 REST API)는 아직 안 붙였다
 * (Agora Customer ID/Secret이라는 별도 인증정보가 더 필요해서 다음 단계로 남겨둠).
 *
 * ⚠️ 이 코드는 타입체크/빌드까지만 확인했고, 실제 브라우저에서 마이크 권한을 받아
 * join하는 것까지는 검증 못 했다 (샌드박스 환경이라 마이크가 없음) — `npm run dev`로
 * 직접 눌러서 확인해봐야 한다.
 */

export type AgoraConnectionStatus = "연결안됨" | "연결중" | "연결됨" | "오류";

export interface RemoteParticipant {
  uid: string | number;
  hasAudio: boolean;
}

export interface AgoraSessionHandlers {
  onStatusChange: (status: AgoraConnectionStatus, error?: string) => void;
  onRemoteParticipantsChange: (participants: RemoteParticipant[]) => void;
}

interface TokenResponse {
  appId: string;
  token: string;
  channelName: string;
  uid: number;
  expiresInSeconds: number;
}

async function fetchAgoraToken(channelName: string): Promise<TokenResponse> {
  const res = await fetch("/api/agora-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelName, role: "publisher" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `토큰 발급 실패 (HTTP ${res.status})`);
  }
  return res.json();
}

/** 회의 하나에 대한 Agora RTC 음성 연결을 관리하는 세션. */
export class AgoraVoiceSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private localAudioTrack: any = null;
  private remoteParticipants = new Map<string | number, RemoteParticipant>();
  private handlers: AgoraSessionHandlers;

  constructor(handlers: AgoraSessionHandlers) {
    this.handlers = handlers;
  }

  private emitRemote() {
    this.handlers.onRemoteParticipantsChange(Array.from(this.remoteParticipants.values()));
  }

  async connect(channelName: string): Promise<void> {
    this.handlers.onStatusChange("연결중");
    try {
      const { appId, token, uid } = await fetchAgoraToken(channelName);

      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
        await this.client.subscribe(user, mediaType);
        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
        this.remoteParticipants.set(user.uid, { uid: user.uid, hasAudio: mediaType === "audio" });
        this.emitRemote();
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on("user-unpublished", (user: any) => {
        this.remoteParticipants.delete(user.uid);
        this.emitRemote();
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on("user-left", (user: any) => {
        this.remoteParticipants.delete(user.uid);
        this.emitRemote();
      });

      await this.client.join(appId, channelName, token, uid);

      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await this.client.publish([this.localAudioTrack]);

      this.handlers.onStatusChange("연결됨");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.handlers.onStatusChange("오류", message);
      // 연결 중 만든 리소스가 있으면 정리
      await this.disconnect().catch(() => {});
      throw err;
    }
  }

  setMuted(muted: boolean) {
    this.localAudioTrack?.setEnabled?.(!muted);
  }

  async disconnect(): Promise<void> {
    try {
      this.localAudioTrack?.close();
    } catch {
      // ignore
    }
    this.localAudioTrack = null;

    if (this.client) {
      try {
        await this.client.leave();
      } catch {
        // ignore
      }
      this.client.removeAllListeners?.();
      this.client = null;
    }

    this.remoteParticipants.clear();
    this.handlers.onStatusChange("연결안됨");
  }
}
