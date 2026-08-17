import fs from "fs";
import path from "path";

/**
 * ⚠️ 데모용 임시 저장소 (파일 기반 — 이유는 meetingSnapshotStore.ts와 동일: Next.js dev
 * 모드에서 API 라우트마다 모듈이 따로 컴파일되는 문제 때문에 메모리 Map으론 상태 공유가 안 됨).
 *
 * 프론트 로컬(localStorage) 프로젝트/회의가 백엔드 Project/Agenda/Meeting 어디에
 * 대응하는지 기록한다. "라이브 시작"을 처음 누른 시점에 한 번만 백엔드에 만들고,
 * 이후엔 이 매핑을 재사용한다 — 매번 새로 만들면 백엔드에 중복 데이터가 쌓인다.
 */
const MEETING_STORE_FILE = path.join(process.cwd(), ".tmp-backend-meeting-links.json");
const PROJECT_STORE_FILE = path.join(process.cwd(), ".tmp-backend-project-links.json");

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

export function getBackendProjectId(localProjectId: string): string | undefined {
  return readJson<string>(PROJECT_STORE_FILE)[localProjectId];
}

export function saveBackendProjectId(localProjectId: string, backendProjectId: string) {
  const data = readJson<string>(PROJECT_STORE_FILE);
  data[localProjectId] = backendProjectId;
  writeJson(PROJECT_STORE_FILE, data);
}
