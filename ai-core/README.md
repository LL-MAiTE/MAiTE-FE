# ai-core — 특기전력 AI 핵심 로직 프로토타입

"AI 비동기 협업 대리 진행 서비스"의 핵심 AI 로직 2개를 UI 없이 콘솔 레벨에서
검증하기 위한 프로토타입입니다.

- `generateDraftPositions`: 답변 작성자가 선택한 문서를 근거로 예상 질문(안건)과
  답변 초안을 생성합니다. 사람은 확인·승인만 하면 됩니다.
- `matchIntentOrHold`: 실시간 미팅 중 상대방 질문을 사전 승인된 안건과 매칭하거나,
  일치하는 것이 없으면 절대 지어내지 않고 보류시킵니다.

## 폴더 구조

```
/ai-core
  /src
    generateDraftPositions.ts   # 함수 1
    matchIntentOrHold.ts        # 함수 2
    openaiClient.ts             # OpenAI 클라이언트 세팅
    types.ts                    # 공용 타입 정의
  test-scenario.ts              # 두 함수를 순서대로 호출하는 테스트 시나리오
  package.json
  tsconfig.json
  .env.example
```

## 실행 방법

1. 의존성 설치

   ```bash
   cd ai-core
   npm install
   ```

2. 환경변수 설정

   `.env.example`을 복사해 `.env` 파일을 만들고 `OPENAI_API_KEY`를 채워주세요.

   ```bash
   cp .env.example .env
   # .env 파일을 열어 OPENAI_API_KEY=sk-... 값을 채워넣기
   ```

3. 테스트 시나리오 실행

   ```bash
   npx ts-node test-scenario.ts
   ```

   (또는 `npm run test-scenario`)

## 테스트 시나리오 개요

1. 3개 문서(핵심 맥락 1개 + 근거 문서 2개)와 회의 정보("API 마감일 협의")로
   `generateDraftPositions`를 호출해 안건 초안을 생성하고 콘솔에 출력합니다.
2. 생성된 안건 중 "API 마감일" 관련 안건 하나를 승인됐다고 가정하고
   (`approvalStatus: "승인"` 수동 세팅), `matchIntentOrHold`에 아래 3개 질문을
   순서대로 넣어 테스트합니다.
   - **Q1** "API 마감일 3일만 당길 수 있나요?" → 매칭되어 8/28까지 가능하다는
     취지의 답이 나와야 합니다 (`containsCriticalNumber: true`).
   - **Q2** "그럼 계약 기간도 같이 늘려야 하나요?" → 문서에 근거가 없으므로
     매칭되지 않고 보류(`matched: false`)되어야 합니다.
   - **Q3** "혹시 QA 인력도 추가로 필요할까요?" → 마찬가지로 근거가 없으므로
     보류되어야 합니다.

## 검증 포인트 (실행 후 눈으로 확인)

- Q1이 실제로 매칭되고, "8월 28일"이라는 구체적 날짜가
  `containsCriticalNumber: true`로 표시되는지.
- Q2, Q3가 그럴듯해 보인다는 이유로 억지로 매칭되지 않고 제대로 보류되는지
  (**가장 중요한 검증 포인트**).
- 함수 1에서 "8월 28일 협상 카드" 같은 민감한 내부 정보가 `preference`가 아니라
  `concessionRange`(양보 가능 범위)로, 그리고 "8/28 초과 불가"가 `dealbreaker`
  (양보 불가 사항)로 적절히 분류되는지.

결과를 보고 시스템 프롬프트(`src/generateDraftPositions.ts`,
`src/matchIntentOrHold.ts` 상단의 `SYSTEM_PROMPT` 상수)를 튜닝하면 됩니다.
