# 특기전력 — AI 비동기 협업 대리 진행 서비스

시차가 큰 글로벌 팀이 실시간 회의 없이도, **답변 작성자가 사전에 승인한 내용만** AI가
상대방에게 대신 전달하는 서비스입니다. AI는 절대 새로운 내용을 지어내지 않고, 사전
승인된 것 중 의도가 일치하는 것만 찾아 전달합니다. (해커톤 프로젝트)

## 용어 (계층 구조)

- **프로젝트**: 문서를 계속 쌓아두는 단위 (책장)
- **회의**: 이름 + 목적을 입력하고, 프로젝트에 쌓인 문서 중 관련 파일을 선택해서 만드는 단위
- **안건**: 회의 하나에 속한 개별 예상 질문-답변 단위. AI가 생성하거나 사용자가 직접 추가

## 저장소 구조

```
/ai-core     # AI 로직 프로토타입 (Node.js + TypeScript, OpenAI API)
/frontend    # 화면 (Next.js 14 App Router + TypeScript, 지금은 mock 데이터 기반)
```

각 폴더의 상세 구조·실행법은 [ai-core/README.md](ai-core/README.md),
[frontend/README.md](frontend/README.md) 참고.

## 역할 분담

| 담당 | 영역 | 사용 기술 | 브랜치 |
| --- | --- | --- | --- |
| **A** | 회의 준비 화면 — 문서 연동(기능1), 회의 생성+AI 안건 초안(기능2), 안건 승인(기능3) | OpenAI만 | `feat/meeting-prep` |
| **B** | 미팅 진행/검토 화면 — 실시간 인식+화자분리(기능4), AI 대리진행 고지(기능5), 통역전달+숫자확인(기능6), 대안조율(기능7), 보류 후속처리(기능8·8-1), 결과검토(기능9), 필수검토항목(기능10) | OpenAI + Agora | `feat/live-meeting` |

디자인·백엔드는 별도 파트 담당.

### A ↔ B 인계 지점 (계약)

1. **승인된 안건 스냅샷**: A는 회의 준비 체크포인트마다 안건 `topic` 단위로 최신 활성
   버전만 모은 스냅샷을 만들어야 함 (반려/삭제됨/초안 상태는 절대 포함 금지). B의
   실시간 매칭(`matchIntentOrHold`)은 이 스냅샷만 입력으로 받는다.
2. **"미팅 시작" 버튼**: A의 안건 승인 화면(`frontend/app/.../meetings/[meetingId]/page.tsx`)에
   있고, 누르는 순간 위 스냅샷을 확정(freeze)해서 B의 라이브 화면(`.../live`)으로 넘긴다.
   그 이후 승인 화면에서 안건을 더 승인/수정해도 이미 시작된 라이브 미팅엔 영향 없어야 한다.
3. **공용 타입**: `frontend/lib/types.ts`가 A/B 모두의 기준. 필드 추가는 자유롭지만 기존
   필드명/구조를 바꿀 땐 서로 먼저 상의할 것. `frontend/lib/store.tsx`(mock 백엔드),
   `frontend/lib/mockAi.ts`, `frontend/lib/mockSeed.ts`도 양쪽 화면이 같이 참조하므로 동일.

## 브랜치 전략

- `main`: 항상 돌아가는 상태 유지. 직접 push 금지, PR로만 머지.
- `feat/meeting-prep`: A 작업 브랜치
- `feat/live-meeting`: B 작업 브랜치
- 공용 파일(`frontend/lib/types.ts`, `store.tsx`, `mockAi.ts`, `mockSeed.ts`,
  `frontend/components/*`)을 건드리는 PR은 A/B 서로 리뷰 후 머지.

## 빠른 시작

```bash
git clone https://github.com/hhyyzznnn/tkzr.git
cd tkzr

# AI 로직
cd ai-core && npm install && cp .env.example .env
# .env에 OPENAI_API_KEY 채워넣기
npx ts-node test-scenario.ts

# 화면
cd ../frontend && npm install && npm run dev
# http://localhost:3000
```

## 핵심 비즈니스 규칙 (요약)

- 안건은 질문 성격에 맞는 필드만 채움 (관련 없는 필드는 절대 습관적으로 채우지 않음)
- 문서에 없는 내용은 추정 표시하거나 아예 안건을 만들지 않음 — 절대 지어내지 않음
- 실시간 매칭은 핵심 의도가 일치해야만 매칭, 조금이라도 불확실하면 보류
- 숫자/금액/일정 등 핵심 수치 포함 답변 → O/X 확인 팝업, 10초 미응답 시 자동 보류
- 보류 항목 후속 답변 → 24~48시간 내 미응답이면 자동 확정, 재오픈은 항목당 최대 2회
- 재오픈 상한 도달 시 "실시간 조율 필요"로 종결 (서비스 안에서 모든 걸 해결하려 하지 않음)
- 미팅 종료는 버튼이 아니라, 모든 보류 항목이 종결되는 순간 자동으로 상태 전환
