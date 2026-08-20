import fs from "fs";
import path from "path";

/**
 * ⚠️ 데모용 임시 저장소 (파일 기반 — 이유는 meetingSnapshotStore.ts와 동일: Next.js dev
 * 모드에서 API 라우트마다 모듈이 따로 컴파일되는 문제 때문에 메모리 Map으론 상태 공유가 안 됨).
 *
 * 프론트 로컬(localStorage) 회의가 백엔드 Agenda/Meeting 어디에 대응하는지 기록한다.
 * "라이브 시작"을 처음 누른 시점에 한 번만 백엔드에 만들고, 이후엔 이 매핑을 재사용한다 —
 * 매번 새로 만들면 백엔드에 중복 데이터가 쌓인다.
 *
 * 예전엔 프로젝트도 이런 매핑이 따로 필요했는데(getBackendProjectId/saveBackendProjectId),
 * 이제 프로젝트는 실제 백엔드가 원본이라 project.id 자체가 곧 백엔드 UUID다 — 매핑이
 * 필요 없어져서 지웠다. 회의/안건은 아직 로컬(mock)이 원본이라 이 매핑이 계속 필요하다.
 * [[tkzr-scope-decisions]]
 */
const MEETING_STORE_FILE = path.join(process.cwd(), ".tmp-backend-meeting-links.json");

interface MeetingLinkRecord {
  backendAgendaId: string;
  backendMeetingId: string;
}

function readJson<T>(file: string): Record<string, T> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

function writeJson<T>(file: string, data: Record<string, T>) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getBackendLink(localMeetingId: string): MeetingLinkRecord | undefined {
  return readJson<MeetingLinkRecord>(MEETING_STORE_FILE)[localMeetingId];
}

export function saveBackendLink(localMeetingId: string, record: MeetingLinkRecord) {
  const data = readJson<MeetingLinkRecord>(MEETING_STORE_FILE);
  data[localMeetingId] = record;
  writeJson(MEETING_STORE_FILE, data);
}
