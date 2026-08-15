import "dotenv/config";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[openaiClient] 경고: OPENAI_API_KEY 환경변수가 설정되어 있지 않습니다. " +
      ".env 파일을 만들고 키를 채워주세요 (.env.example 참고)."
  );
}

/** 프로젝트 전역에서 공용으로 사용하는 OpenAI 클라이언트 */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** gpt-4o 계열 모델. 필요하면 .env의 OPENAI_MODEL로 오버라이드 가능 */
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
