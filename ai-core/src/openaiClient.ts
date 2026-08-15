import "dotenv/config";
import OpenAI from "openai";

/** gpt-4o 계열 모델. 필요하면 .env의 OPENAI_MODEL로 오버라이드 가능 */
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// 클라이언트를 모듈 로드 시점에 즉시 생성하면, 이 파일을 import만 해도(실제 호출 전에도)
// 키가 없을 때 바로 예외가 던져진다. Next.js가 빌드 시 라우트를 정적 분석하며 모듈을
// import하는 경우처럼, "아직 호출은 안 했는데 import만 했다"는 상황에서 깨지는 걸 막기
// 위해 실제 첫 사용 시점까지 생성을 미루는 lazy singleton으로 만든다.
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      // eslint-disable-next-line no-console
      console.warn(
        "[openaiClient] 경고: OPENAI_API_KEY 환경변수가 설정되어 있지 않습니다. " +
          ".env 파일을 만들고 키를 채워주세요 (.env.example 참고)."
      );
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * 프로젝트 전역에서 공용으로 사용하는 OpenAI 클라이언트.
 * 기존 사용법(`openai.chat.completions.create(...)`)을 그대로 유지하기 위해
 * Proxy로 감싸 실제 사용 시점에 lazy하게 초기화한다.
 */
export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
