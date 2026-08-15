# frontend — 특기전력 프론트엔드 스캐폴드

"AI 비동기 협업 대리 진행 서비스"의 전체 화면 흐름을 **백엔드 없이(mock 데이터 기반)**
먼저 만들어본 Next.js(App Router) + TypeScript 스캐폴드입니다. 디자인과 백엔드는 다른
파트에서 담당하며, 이 프로젝트는 화면 구조/상태 흐름/비즈니스 규칙을 코드로 먼저
검증하는 용도입니다.

## 실행 방법

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000` 접속. mock 데이터가 `localStorage`에 저장되므로 새로고침해도
상태가 유지됩니다. 초기화하려면 브라우저 devtools에서 `localStorage.removeItem("tkzr_store_v1")`
후 새로고침하세요.

```bash
npm run build   # 프로덕션 빌드 검증
npm run typecheck
```

## 용어 / 화면 구조

프로젝트(문서 누적 단위) → 회의(이름+목적+선택 문서로 생성) → 안건(회의 하나에 속한
예상 질문-답변 단위). 라우팅은 이 계층을 그대로 따릅니다.

| 경로 | 화면 | 관련 기능 |
| --- | --- | --- |
| `/` | 프로젝트 목록 | 기능 1 |
| `/projects/[projectId]` | 문서함 + 회의 목록 | 기능 1 |
| `/projects/[projectId]/meetings/new` | 회의 생성 (파일 선택 필수) | 기능 2 |
| `/projects/[projectId]/meetings/[meetingId]` | 안건 승인 화면 | 기능 2, 3 |
| `/projects/[projectId]/meetings/[meetingId]/live` | 실시간 미팅 | 기능 4, 5, 6, 7 |
| `/projects/[projectId]/meetings/[meetingId]/review` | 결과 검토 | 기능 8, 8-1, 9, 10 |

시드 데이터(`lib/mockSeed.ts`)에 회의 3개를 미리 각 단계별로 넣어뒀습니다 (승인대기 /
라이브 / 후속답변대기) — 위 표의 화면들을 처음부터 클릭해서 순서대로 만들지 않아도
바로 각 화면의 데모 상태를 볼 수 있습니다. 문서 3개와 "API 마감일" 안건은
`../ai-core/test-scenario.ts`에서 검증한 시나리오와 동일하게 맞춰뒀습니다.

## 구조

```
/frontend
  /app
    layout.tsx, globals.css, page.tsx (프로젝트 목록)
    /projects/[projectId]/page.tsx (프로젝트 상세)
    /projects/[projectId]/meetings/new/page.tsx (회의 생성)
    /projects/[projectId]/meetings/[meetingId]/page.tsx (안건 승인)
    /projects/[projectId]/meetings/[meetingId]/live/page.tsx (실시간 미팅)
    /projects/[projectId]/meetings/[meetingId]/review/page.tsx (결과 검토)
  /components (Badge, Card, PositionCard 등 공용 UI)
  /lib
    types.ts       # 전체 도메인 타입 (기능 명세서 용어 그대로)
    labels.ts       # 필드 한글 라벨
    mockSeed.ts      # 데모용 시드 데이터
    mockAi.ts        # ⚠️ mock AI 로직 (아래 참고)
    store.tsx        # React Context 기반 "mock 백엔드" (localStorage 영속)
```

## ⚠️ 지금은 전부 mock입니다 — 백엔드 연동 시 교체 지점

이번 스캐폴드는 **백엔드 API가 아직 없는 상태에서 화면을 먼저 완성**하기 위해,
`lib/store.tsx`가 브라우저 안에서 직접 상태를 들고 있는 "가짜 백엔드" 역할을 합니다.
실제 백엔드가 준비되면 아래 두 곳만 교체하면 됩니다 (컴포넌트/페이지 코드는 그대로 두고
`useStore()` 훅 사용법만 유지):

1. **`lib/store.tsx`의 각 액션 함수** — 지금은 `setState`로 직접 상태를 바꾸지만,
   실제로는 여기서 API를 호출하고 응답으로 상태를 갱신하면 됩니다.
2. **`lib/mockAi.ts`의 두 함수** (`generateMockDraftPositions`, `matchMockIntentOrHold`) —
   지금은 키워드 overlap 같은 아주 단순한 휴리스틱입니다. 실제 판단 품질이 검증된
   로직은 `../ai-core/src/generateDraftPositions.ts`, `../ai-core/src/matchIntentOrHold.ts`에
   있으므로, 백엔드가 이 두 함수를 호출하는 API를 노출하면 프론트는 그 API를 부르는
   걸로 바꾸면 됩니다. 입출력 타입(`PositionDraft`/`MatchResult` 계열)은 이미 맞춰뒀습니다.

## 이 스캐폴드가 구현/데모하는 비즈니스 규칙

- 회의 생성 시 문서 최소 1개 선택 필수 (핵심 맥락 md만 선택해도 무방)
- 안건은 질문 성격에 맞는 필드만 표시 (`activeFields`에 없는 필드는 카드에 아예 안 보임)
- 안건 버전 관리: 수정하면 버전 증가, 안 건드리면 유지, 삭제는 "삭제됨" 상태로 전환 후 매칭 대상 제외
- 실시간 매칭: 핵심 의도 불일치 시 무조건 보류 (지어내지 않음)
- 숫자/금액/일정 포함 답변 → O/X 확인 팝업, 10초 카운트다운 실제로 동작 (미응답 시 자동 보류)
- 보류 항목 후속 처리: 답변 전달 → 24~48시간(데모는 36시간 고정) 후 자동 확정, 재오픈 최대 2회
  제한, 상한 도달 시 "실시간 조율 필요"로 종결
- 사후 재보류(사후검토에서 "재보류" 선택)도 같은 재오픈 횟수 상한에 포함
- 미팅 상태는 버튼이 아니라 보류 항목이 전부 종결되는 순간 자동으로 "종료"로 전환

## 알려진 제약 (해커톤 스캐폴드 범위)

- 인증/로그인 없음, 단일 사용자(답변 작성자) 관점만 구현
- Next.js 14.2.x + params를 동기 prop으로 받는 방식 사용. `npm audit`에 Next 15/16 관련
  고보안 취약점이 여러 건 뜨는데, 대부분 이미지 최적화·미들웨어·커스텀 서버처럼 이 스캐폴드가
  쓰지 않는 기능에 대한 것들입니다. 다만 Next 15+는 `params`가 Promise로 바뀌는 breaking
  change라 라우팅 코드 전반을 다시 손봐야 하므로, 실제 배포 전에는 최신 버전으로 업그레이드를
  검토해주세요.
- 실시간 STT/화자분리/Agora 연동은 하지 않고, `live` 화면에서 텍스트 입력으로 질문을
  시뮬레이션합니다.
- 문서 업로드는 파일 첨부가 아니라 제목+본문 붙여넣기 폼입니다 (Notion/Git 연동은 미구현).
