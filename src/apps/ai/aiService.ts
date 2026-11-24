import { GoogleGenAI } from '@google/genai';

export type AiErrorCode =
  | 'AI_CONFIG_ERROR'
  | 'AI_TIMEOUT_ERROR'
  | 'AI_UPSTREAM_ERROR';

export class AiServiceError extends Error {
  public readonly code: AiErrorCode;
  public readonly statusCode: number;
  public readonly userMessage: string;

  constructor(
    code: AiErrorCode,
    statusCode: number,
    userMessage: string,
    detailMessage?: string
  ) {
    super(detailMessage || userMessage);
    this.name = 'AiServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

export interface AskAiResult {
  answer: string;
  model: string;
}

const MODEL_NAME = 'gemini-2.5-flash';
const TIMEOUT_MS = 30_000;
const SYSTEM_INSTRUCTION =
  'あなたはWebアプリケーション内の親切で正確なAIアシスタントです。ユーザーの質問に対して、簡潔かつ分かりやすく日本語で回答してください。';

/**
 * Gemini API を呼び出して質問に対する回答を生成する
 */
export async function generateAnswer(question: string): Promise<AskAiResult> {
  const apiKey = process.env.AI_API_KEY?.trim();

  if (!apiKey) {
    throw new AiServiceError(
      'AI_CONFIG_ERROR',
      500,
      '現在AI機能を利用できません。管理者にお問い合わせください。',
      'AI_API_KEY is not configured in environment variables'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let isTimedOut = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      isTimedOut = true;
      reject(
        new AiServiceError(
          'AI_TIMEOUT_ERROR',
          504,
          'AIからの応答がタイムアウトしました。時間をおいて再度お試しください。',
          `Gemini API request timed out after ${TIMEOUT_MS}ms`
        )
      );
    }, TIMEOUT_MS);
  });

  try {
    const apiPromise = ai.models.generateContent({
      model: MODEL_NAME,
      contents: question,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const answerText = response.text?.trim();

    if (!answerText) {
      throw new AiServiceError(
        'AI_UPSTREAM_ERROR',
        502,
        'AIサービスとの通信中にエラーが発生しました。しばらくしてから再度お試しください。',
        'Empty response text received from Gemini API'
      );
    }

    return {
      answer: answerText,
      model: MODEL_NAME,
    };
  } catch (error) {
    if (error instanceof AiServiceError) {
      throw error;
    }

    if (isTimedOut) {
      throw new AiServiceError(
        'AI_TIMEOUT_ERROR',
        504,
        'AIからの応答がタイムアウトしました。時間をおいて再度お試しください。',
        'Gemini API request timed out'
      );
    }

    console.error('[AiService] Gemini API Error:', error);
    throw new AiServiceError(
      'AI_UPSTREAM_ERROR',
      502,
      'AIサービスとの通信中にエラーが発生しました。しばらくしてから再度お試しください。',
      error instanceof Error ? error.message : 'Unknown upstream error'
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}