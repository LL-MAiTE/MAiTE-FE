import fs from "fs";
import path from "path";

/**
 * ⚠️ 데모용 임시 저장소 (실제 배포 전 DB로 교체 필요).
 *
 * 처음엔 서버 메모리(Map)로 만들었는데, Next.js dev 모드에서 API 라우트마다 모듈이
 * 따로 컴파일되는 특성 때문에 /start와 /stop이 서로 다른 Map 인스턴스를 참조하는
 * 문제가 실제로 발생했다 (같은 파일을 import해도 상태 공유가 안 됨). 그래서 프로세스
 * 메모리 대신 로컬 파일(JSON)에 저장하는 방식으로 바꿔서 이 문제를 피한다 — 파일시스템은
 * 라우트/모듈 인스턴스와 무관하게 항상 같은 실제 파일을 가리키므로 안전하다.
 */
const STORE_FILE = path.join(process.cwd(), ".tmp-agora-agent-sessions.json");

function readStore(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, string>) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

export function setAgentSession(meetingId: string, agentId: string) {
  const data = readStore();
  data[meetingId] = agentId;
  writeStore(data);
}

export function getAgentSession(meetingId: string): string | undefined {
  return readStore()[meetingId];
}

export function clearAgentSession(meetingId: string) {
  const data = readStore();
  delete data[meetingId];
  writeStore(data);
}
