// lib/errors.ts
import { ZodError } from 'zod';
import { ErrorCode, MessageCode } from '@/types';
import { MessageParams } from './messages';
import { formatMessage } from './messages';
import { AppErrorPayload } from '@/types';
import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';
// @ts-ignore
import { MastraError } from '@mastra/core/error';

/**
 * 例外として扱うアプリケーションエラー。
 * - expose: true のときのみ message をクライアントに出す
 */
export class AppError extends Error {
  public readonly expose: boolean;
  public readonly errorCode: ErrorCode;
  public readonly messageCode: MessageCode;
  public readonly messageParams: MessageParams;
  // ログに出すための追加情報
  public readonly couse?: unknown;

  constructor(
    errorCode: ErrorCode,
    options?: {
      expose?: boolean;
      cause?: unknown;
      messageCode?: MessageCode;
      messageParams?: MessageParams;
    },
  ) {
    const message = formatMessage(
      options?.messageCode ?? 'UNKNOWN_ERROR',
      options?.messageParams ?? {},
    );
    super(message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.expose = options?.expose ?? false;
    this.couse = options?.cause;
    this.messageCode = options?.messageCode ?? 'UNKNOWN_ERROR';
    this.messageParams = options?.messageParams ?? {};
  }

  override get message(): string {
    return this.expose ? super.message : formatMessage('UNKNOWN_ERROR');
  }
}

// よく使うビルダー
export const internalError = (options?: {
  expose?: boolean;
  cause?: unknown;
  messageCode?: MessageCode;
  messageParams?: MessageParams;
}) => new AppError('INTERNAL', options);

export function repositoryError(detail: string, error: unknown) {
  return internalError({
    expose: true,
    messageCode: 'DATA_ACCESS_ERROR',
    messageParams: { detail },
    cause: error,
  });
}

/**
 * Zod のエラー → クライアントに安全に出せる形へ
 */
export function zodToAppError(e: ZodError) {
  let detail = '';
  for (const issue of e.issues) {
    detail += `・${issue.message}\n`;
  }

  return new AppError('VALIDATION', {
    expose: true,
    messageCode: 'VALIDATION_ERROR',
    cause: e,
    messageParams: { detail },
  });
}

// AIへの送信メッセージが巨大すぎる(例えば、base64画像を詰め込みすぎた場合など)場合に発生する RangeError を検知するための型ガード
function isInvalidStringLengthError(err: unknown): err is RangeError {
  return (
    err instanceof RangeError &&
    typeof err.message === 'string' &&
    err.message.includes('Invalid string length')
  );
}

/**
 * 予期しない例外を AppError に正規化。
 * - 既に AppError → そのまま
 * - ZodError → VALIDATION に変換
 * - それ以外 → INTERNAL に丸める
 */
export function normalizeUnknownError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return zodToAppError(err);
  const aiApiSafeError = extractAIAPISafeError(err);
  if (aiApiSafeError) {
    let errorMessage = aiApiSafeError.message;
    if (
      APICallError.isInstance(aiApiSafeError) &&
      aiApiSafeError.responseHeaders
    ) {
      errorMessage += `: ${aiApiSafeError.responseHeaders.errorMessage || aiApiSafeError.responseHeaders.errormessage || JSON.stringify(aiApiSafeError.responseBody, null, 2)}`;
    } else if (NoObjectGeneratedError.isInstance(aiApiSafeError)) {
      errorMessage = 'AIから不正な応答を検知したため処理を終了しました';
    }
    return new AppError('AI_API', {
      expose: true,
      cause: err,
      messageCode: 'AI_API_ERROR',
      messageParams: { detail: errorMessage },
    });
  }
  return internalError({
    expose: false,
    cause: err,
  });
}

export function normalizeUnknownIpcError(
  err: unknown,
  ipcName?: string,
): AppError {
  const normalizedError = normalizeUnknownError(err);
  const hasDetail =
    normalizedError.expose &&
    normalizedError.message.trim() !== formatMessage('UNKNOWN_ERROR');
  const detail = hasDetail ? normalizedError.message : undefined;
  return internalError({
    expose: true,
    cause: err,
    messageCode: 'IPC_ERROR',
    messageParams: {
      hasIpcName: !!ipcName,
      ipcName: ipcName ?? '',
      hasDetail,
      detail,
    },
  });
}

export function extractAIAPISafeError(error: unknown): Error | null {
  if (APICallError.isInstance(error)) return error;
  if (error instanceof MastraError) {
    if (isInvalidStringLengthError(error.cause)) {
      return new AppError('VALIDATION', {
        expose: true,
        cause: error,
        messageCode: 'AI_MESSAGE_TOO_LARGE',
      });
    }
    if (APICallError.isInstance(error.cause)) return error.cause;
    if (NoObjectGeneratedError.isInstance(error.cause)) return error.cause;
    if (RetryError.isInstance(error.cause)) {
      for (const e of error.cause.errors) {
        if (APICallError.isInstance(e)) return e;
      }
    }
  }
  return null;
}

/**
 * AppError をクライアントに返せるプレーン JSON へ
 */
export function toPayload(e: AppError): AppErrorPayload {
  return {
    code: e.errorCode,
    message: e.message,
  };
}
