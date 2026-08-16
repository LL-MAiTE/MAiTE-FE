/**
 * ⚠️ 데모용 임시 저장소 (서버 메모리, 재시작하면 날아감). meetingSnapshotStore.ts와 같은 이유:
 * 실제 DB가 붙기 전까지, "이 회의에 지금 어떤 agentId가 떠 있는지"를 잠깐 기억해두는 용도.
 * 회의 종료/재시작 시 stop 라우트가 이걸로 agentId를 찾아 leave를 호출한다.
 */
const sessions = new Map<string, string>(); // meetingId -> agentId

export function setAgentSession(meetingId: string, agentId: string) {
  sessions.set(meetingId, agentId);
}

export function getAgentSession(meetingId: string): string | undefined {
  return sessions.get(meetingId);
}

export function clearAgentSession(meetingId: string) {
  sessions.delete(meetingId);
}
