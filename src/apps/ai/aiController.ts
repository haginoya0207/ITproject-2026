import type { Request, Response, NextFunction } from 'express';
import { generateAnswer, AiServiceError } from '.aiService.js';

const MAX_QUESTION_LENGTH = 2000;

/**
 * GET /ai - AI質問画面のレンダリング
 */
export function renderIndex(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void req;
  try {
    res.render('ai/index', {
      title: 'AI質問アシスタント',
      maxLength: MAX_QUESTION_LENGTH,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /ai/ask - 質問を受け付け、AIの回答をJSONで返却する
 */
export async function postAsk(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.body || typeof req.body.question !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST_FORMAT',
          message: 'リクエスト形式が正しくありません。',
        },
      });
      return;
    }

    const trimmedQuestion = req.body.question.trim();

    if (trimmedQuestion.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_EMPTY',
          message: '質問内容を入力してください。',
        },
      });
      return;
    }

    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_TOO_LONG',
          message: `質問は${MAX_QUESTION_LENGTH.toLocaleString()}文字以内で入力してください。`,
        },
      });
      return;
    }

    const result = await generateAnswer(trimmedQuestion);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AiServiceError) {
      console.error(`[AiController] ${error.code}: ${error.message}`);
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.userMessage,
        },
      });
      return;
    }

    console.error('[AiController] Unexpected Error:', error);
    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '予期せぬエラーが発生しました。',
      },
    });
  }
}