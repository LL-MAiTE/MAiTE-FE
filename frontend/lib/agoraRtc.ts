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
  hasVideo: boolean;
  /** 비디오가 있을 때만 채워짐(아바타). 렌더링하는 쪽에서 track.play(domElement)로 붙인다. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoTrack?: any;
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

  /**
   * externalCredentials가 있으면(백엔드가 /meetings/:id/start로 이미 발급해준 토큰)
   * 그걸 그대로 쓰고, 없으면 우리 자체 /api/agora-token으로 직접 발급받는다.
   * 백엔드 연동 후엔 항상 전자를 쓴다 — 채널/토큰의 원본이 백엔드 쪽 하나로 통일돼야
   * 사람 참여자와 백엔드가 join시킨 AI 에이전트가 같은 채널에서 만난다.
   */
  async connect(
    channelName: string,
    externalCredentials?: { appId: string; token: string; uid?: number }
  ): Promise<void> {
    this.handlers.onStatusChange("연결중");
    try {
      const { appId, token, uid } = externalCredentials
        ? { appId: externalCredentials.appId, token: externalCredentials.token, uid: externalCredentials.uid ?? 0 }
        : await fetchAgoraToken(channelName);
      // eslint-disable-next-line no-console
      console.log(`[Agora] 토큰 준비 완료(${externalCredentials ? "외부 공급" : "자체 발급"}) — channel=${channelName}, 내 uid=${uid}`);

      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
        // eslint-disable-next-line no-console
        console.log(`[Agora] user-published 이벤트 — 상대 uid=${user.uid}, mediaType=${mediaType}`);
        await this.client.subscribe(user, mediaType);

        const existing = this.remoteParticipants.get(user.uid);
        if (mediaType === "audio") {
          user.audioTrack?.play();
          // eslint-disable-next-line no-console
          console.log(`[Agora] 상대(uid=${user.uid}) 오디오 재생 시작`);
          this.remoteParticipants.set(user.uid, {
            uid: user.uid,
            hasAudio: true,
            hasVideo: existing?.hasVideo ?? false,
            videoTrack: existing?.videoTrack,
          });
        } else {
          // 비디오는 여기서 play()하지 않는다 — 실제로 붙일 DOM 엘리먼트를 UI 쪽이
          // 갖고 있으니, videoTrack을 그대로 넘겨서 컴포넌트가 자기 <div>에 붙이게 한다.
          // eslint-disable-next-line no-console
          console.log(`[Agora] 상대(uid=${user.uid}) 비디오 트랙 수신 (아바타로 추정)`);
          this.remoteParticipants.set(user.uid, {
            uid: user.uid,
            hasAudio: existing?.hasAudio ?? false,
            hasVideo: true,
            videoTrack: user.videoTrack,
          });
        }
        this.emitRemote();
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on("user-unpublished", (user: any, mediaType: "audio" | "video") => {
        // eslint-disable-next-line no-console
        console.log(`[Agora] user-unpublished 이벤트 — 상대 uid=${user.uid}, mediaType=${mediaType}`);
        const existing = this.remoteParticipants.get(user.uid);
        if (!existing) return;
        if (mediaType === "video") {
          this.remoteParticipants.set(user.uid, { ...existing, hasVideo: false, videoTrack: undefined });
        } else {
          this.remoteParticipants.set(user.uid, { ...existing, hasAudio: false });
        }
        this.emitRemote();
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on("user-joined", (user: any) => {
        // eslint-disable-next-line no-console
        console.log(`[Agora] user-joined 이벤트(아직 오디오 publish 전) — 상대 uid=${user.uid}`);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.on("user-left", (user: any) => {
        // eslint-disable-next-line no-console
        console.log(`[Agora] user-left 이벤트 — 상대 uid=${user.uid}`);
        this.remoteParticipants.delete(user.uid);
        this.emitRemote();
      });

      await this.client.join(appId, channelName, token, uid);
      // eslint-disable-next-line no-console
      console.log(`[Agora] 채널 join 완료 — 지금 채널 안에 있는 다른 사람 수: ${this.client.remoteUsers.length}`);

      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      // eslint-disable-next-line no-console
      console.log("[Agora] 마이크 트랙 생성 완료:", this.localAudioTrack.getTrackLabel?.());
      await this.client.publish([this.localAudioTrack]);
      // eslint-disable-next-line no-console
      console.log("[Agora] 마이크 publish 완료 — 이제 상대가 내 목소리를 들을 수 있음");

      // 2초마다 내 마이크가 실제로 소리를 잡고 있는지 콘솔에 볼륨 레벨을 찍는다.
      // 말할 때 이 값이 0보다 확실히 커지면 마이크 자체는 정상 동작하는 것.
      const volumeInterval = setInterval(() => {
        if (!this.localAudioTrack) {
          clearInterval(volumeInterval);
          return;
        }
        const level = this.localAudioTrack.getVolumeLevel?.() ?? -1;
        // eslint-disable-next-line no-console
        console.log(`[Agora] 내 마이크 볼륨 레벨: ${level.toFixed(3)} (0에 가까우면 소리 안 잡히는 중)`);
      }, 2000);

      this.handlers.onStatusChange("연결됨");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error("[Agora] 연결 실패:", err);
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
