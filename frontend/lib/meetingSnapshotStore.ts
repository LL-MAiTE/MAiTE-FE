import fs from "fs";
import path from "path";
import type { ApprovedPosition } from "../../ai-core/src/types";

/**
 * ⚠️ 데모용 임시 저장소. 로컬 파일(JSON)에 저장한다 — 서버 재시작하면 유지되지만
 * 실제 서비스에서는 DB로 교체해야 한다. 원래 서버 메모리(Map)로 만들었는데, Next.js
 * dev 모드에서 API 라우트마다 모듈이 따로 컴파일되는 특성 때문에 라우트 간 상태 공유가
 * 안 되는 문제가 실제로 발생해서(agoraAgentSessionStore.ts와 같은 이유) 파일 기반으로 바꿨다.
 *
 * 왜 필요한가: Agora Conversational AI Agent는 우리 브라우저(localStorage)를 거치지
 * 않고 자기 클라우드에서 직접 /api/agora-tool/match-intent를 호출한다. "이 회의의
 * 승인된 안건이 뭔지"를 서버가 스스로 조회할 방법이 없어서, 회의가 "라이브"로 시작될 때
 * 프론트(lib/store.tsx)가 승인된 안건 스냅샷을 여기 올려두고, /api/agora-tool/match-intent가
 * meetingId로 그걸 찾아 쓴다.
 */
const STORE_FILE = path.join(process.cwd(), ".tmp-meeting-snapshots.json");

function readStore(): Record<string, ApprovedPosition[]> {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, ApprovedPosition[]>) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

export function saveMeetingSnapshot(meetingId: string, positions: ApprovedPosition[]) {
  const data = readStore();
  data[meetingId] = positions;
  writeStore(data);
}

export function getMeetingSnapshot(meetingId: string): ApprovedPosition[] | undefined {
  return readStore()[meetingId];
}

export function listMeetingIds(): string[] {
  return Object.keys(readStore());
}
