import type { ApprovedPosition } from "../../ai-core/src/types";

/**
 * ⚠️ 데모용 임시 저장소. Next.js dev 서버 프로세스 메모리에만 있는 Map이라
 * 서버 재시작/핫리로드되면 날아간다. 실제 서비스에서는 DB로 교체해야 한다.
 *
 * 왜 필요한가: Agora Conversational AI Agent는 우리 브라우저(localStorage)를 거치지
 * 않고 자기 클라우드에서 직접 /api/agora-tool/match-intent를 호출한다. 그런데
 * "이 회의의 승인된 안건이 뭔지"는 지금 브라우저에만 있어서, 서버가 스스로 조회할
 * 방법이 없었다 — 그래서 데모용으로 안건 하나를 하드코딩해뒀었다.
 *
 * 이 파일은 그 갭을 최소한으로 메운다: 회의가 "라이브"로 시작될 때 프론트(lib/store.tsx)가
 * 승인된 안건 스냅샷을 이 저장소에 올려두고, /api/agora-tool/match-intent가 meetingId로
 * 그걸 찾아 쓴다. 진짜 프로덕션에서는 이 Map 자리에 실제 DB 조회가 들어가야 한다.
 */
const snapshots = new Map<string, ApprovedPosition[]>();

export function saveMeetingSnapshot(meetingId: string, positions: ApprovedPosition[]) {
  snapshots.set(meetingId, positions);
}

export function getMeetingSnapshot(meetingId: string): ApprovedPosition[] | undefined {
  return snapshots.get(meetingId);
}

export function listMeetingIds(): string[] {
  return Array.from(snapshots.keys());
}
