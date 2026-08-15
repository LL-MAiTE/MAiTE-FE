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

## ⚠️ mock 상태 — 백엔드 연동 시 교체 지점

이번 스캐폴드는 **백엔드 API가 아직 없는 상태에서 화면을 먼저 완성**하기 위해,
`lib/store.tsx`가 브라우저 안에서 직접 상태를 들고 있는 "가짜 백엔드" 역할을 합니다.
실제 백엔드가 준비되면 아래 두 곳만 교체하면 됩니다 (컴포넌트/페이지 코드는 그대로 두고
`useStore()` 훅 사용법만 유지):

1. **`lib/store.tsx`의 각 액션 함수** — 지금은 `setState`로 직접 상태를 바꾸지만,
   실제로는 여기서 API를 호출하고 응답으로 상태를 갱신하면 됩니다.
2. **`lib/mockAi.ts`의 `generateMockDraftPositions`** — 아직 키워드 overlap 흉내 로직입니다
   (A 담당, `../ai-core/src/generateDraftPositions.ts`로 교체 예정).

### 실시간 의도 매칭은 이미 실제 OpenAI로 연결됨

`matchMockIntentOrHold`는 더 이상 최종 로직이 아닙니다. 실시간 미팅 화면에서 질문을
보내면(`lib/store.tsx`의 `askQuestion`) 다음 순서로 동작합니다:

1. `POST /api/match-intent` (`app/api/match-intent/route.ts`) 호출 — 서버 라우트가
   `../ai-core/src/matchIntentOrHold.ts`를 그대로 실행 (프롬프트 원본은 ai-core에만 있음)
2. 성공하면 실제 OpenAI 판단 결과를 사용
3. `OPENAI_API_KEY`가 없거나 호출이 실패하면 **`matchMockIntentOrHold`로 자동 폴백**
   (`intentMatchReasoning`에 `[실제 AI 호출 실패 → mock 폴백: ...]`이 붙어서 구분 가능)

`frontend/.env.local.example`을 `.env.local`로 복사하고 `OPENAI_API_KEY`를 채우면
실제 판단으로 동작합니다 (`.env.local`은 gitignore되어 있어 커밋되지 않음).

### Agora RTC 토큰 서버 라우트

`POST /api/agora-token` (`app/api/agora-token/route.ts`)가 클라이언트의 RTC 채널 join용
단기 토큰을 발급합니다. `AGORA_APP_CERTIFICATE`는 토큰 서명에만 쓰이고 응답에는 절대
포함되지 않습니다 — 클라이언트는 `appId`와 `token`만 받아서 Agora RTC SDK로 join하면
됩니다. `agora-token` 패키지(`RtcTokenBuilder.buildTokenWithUid`) 사용, 토큰/권한 만료
1시간 고정.

```bash
curl -X POST http://localhost:3000/api/agora-token \
  -H "Content-Type: application/json" \
  -d '{"channelName":"test-meeting-room"}'
```

### Agora RTC 실제 음성 채널 연결 (클라이언트)

`lib/agoraRtc.ts`(`AgoraVoiceSession`)가 위 토큰 라우트로 토큰을 받아 `agora-rtc-sdk-ng`로
실제 RTC 채널에 join하고 마이크 오디오를 publish/구독한다. `live` 화면 상단 "실시간 음성
채널" 카드에서 연결/음소거/종료를 조작할 수 있다. 채널명은 `meeting.id`를 그대로 쓴다.

`agora-rtc-sdk-ng`는 브라우저 API(getUserMedia 등)에 의존해서 SSR에서 깨질 수 있으므로,
`connect()` 안에서 동적 import로만 불러온다 (파일 최상단에서 정적 import하지 않음).

⚠️ **타입체크/빌드까지만 확인했고, 실제 브라우저에서 마이크 권한을 받아 join하는 것까지는
검증 못 했습니다** (샌드박스 환경이라 마이크가 없음). `npm run dev`로 직접 켜서 "채널 연결"
버튼을 눌러 실제로 되는지 확인해봐야 합니다.

### Agora Conversational AI Studio Agent — 실제 음성 파이프라인 검증 완료

독립형 Real-Time STT REST API(Customer ID/Secret 인증)를 쓰려던 처음 계획은 폐기했습니다 —
Agora 콘솔이 최근 "Agents"(Conversational AI Studio) 중심으로 리뉴얼되면서 그 구버전 REST
플로우 대신, 콘솔에서 STT(Deepgram)+LLM(OpenAI gpt-4.1-mini)+TTS(Minimax)를 조합한 **Agent**를
만들고 여기에 우리 백엔드를 **Custom Tool(HTTP 웹훅)**로 연결하는 방식으로 갔습니다.

- `app/api/agora-tool/match-intent/route.ts` — Agora Agent가 직접 호출하는 전용 라우트.
  `ai-core/matchIntentOrHold`를 그대로 실행하고, 응답은 `{ response: string }` 필드 하나만
  반환한다 (필드가 여러 개 섞이면 에이전트가 응답을 안 하는 현상이 실제로 관찰됨). 질문 파라미터
  이름은 `question`/`text`/`query`/`utterance` 다 관대하게 받는다 (Agora 쪽에서 호출마다
  스키마 필드명이 다르게 관찰됨).
- `lib/meetingSnapshotStore.ts` + `app/api/meeting-snapshot/route.ts` — 회의별 승인 안건
  스냅샷을 서버 메모리(⚠️ 임시, 프로세스 재시작 시 소실)에 저장/조회. Agora Agent는 브라우저를
  거치지 않고 직접 서버를 호출하므로, `meetingId`(쿼리 파라미터 또는 body)로 그 회의의 실제
  승인 데이터를 조회한다. `lib/store.tsx`의 `startLiveMeeting()`이 라이브 전환 시 자동 업로드.
  `meetingId`가 없거나 스냅샷을 못 찾으면 데모용 안건 하나로 폴백.
- **실제 음성으로 end-to-end 검증 완료**: STT(한국어) → Custom Tool 호출 → `matchIntentOrHold`
  → 응답 → Agent가 그대로 말함. 매칭 질문("마감일 앞당길 수 있나요") → 승인된 답 그대로 발화,
  비매칭 질문("계약 기간도 늘려야 하나요") → 지어내지 않고 정직하게 보류 문구 발화, 둘 다 확인.
- 로컬 서버를 `cloudflared tunnel --url`로 임시 공개해서 테스트함 (Custom Tool은 public URL만
  등록 가능 — localhost/사설망 거부됨). 이 터널은 세션이 끊기면 죽는 **임시 URL**이라, 실제
  운영에서는 안정적인 배포(Vercel 등)로 교체해야 함.

### 남은 진짜 갭

- **Agent가 아직 완전히 수동 설정**: 콘솔에서 손으로 Agent를 만들고 Custom Tool URL을 등록해둔
  상태. 우리 앱에서 회의를 시작할 때 이 Agent를 프로그래밍적으로 해당 회의의 RTC 채널에
  join시키는 자동화(Agora Agent REST API로 start/stop)는 아직 없음 — 지금은 콘솔의 Test 패널
  "Start Call"로 수동 테스트만 가능.
- **`lib/agoraRtc.ts`(사람 참여자용 채널 join)와 이 Agent가 같은 채널에서 만나는 통합 안 됨**:
  지금은 Agent를 콘솔 자체 테스트 채널로만 테스트했고, 우리 `live` 화면에서 사람이 join하는
  채널(`meeting.id`)에 이 Agent가 같이 들어오는 실제 통합은 다음 단계.
- 스냅샷 저장소는 서버 프로세스 메모리 기반 임시 구현 — 실제 배포 전 DB로 교체 필요.

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
- Agora 토큰 발급 + 실제 RTC 채널 join(음성 송수신) 코드는 있지만 브라우저 마이크로 직접
  검증은 못 했습니다 (샌드박스 환경 제약). 다만 별도로 만든 Agora Conversational AI Studio
  Agent + Custom Tool 경로는 실제 음성으로 end-to-end 검증 완료했습니다 (위 섹션 참고) —
  둘을 하나의 채널로 합치는 게 다음 단계입니다. `live` 화면의 "질문 시뮬레이션"(텍스트 입력)은
  여전히 이 둘과는 별개로 동작합니다.
- 문서 업로드는 파일 첨부가 아니라 제목+본문 붙여넣기 폼입니다 (Notion/Git 연동은 미구현).
