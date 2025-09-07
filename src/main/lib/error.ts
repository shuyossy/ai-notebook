// lib/errors.ts
import { ZodError } from 'zod';
import { ErrorCode, MessageCode } from '@/types';
import { MessageParams } from './messages';
import { formatMessage } from './messages';
import { AppErrorPayload } from '@/types';

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
}

// よく使うビルダー
export const internalError = (options?: {
  expose?: boolean;
  cause?: unknown;
  messageCode?: MessageCode;
  messageParams?: MessageParams;
}) => new AppError('INTERNAL', options);

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

/**
 * 予期しない例外を AppError に正規化。
 * - 既に AppError → そのまま
 * - ZodError → VALIDATION に変換
 * - それ以外 → INTERNAL に丸める
 */
export function normalizeUnknownError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return zodToAppError(err);
  // Prisma など各種ライブラリの例外もここで判定して丸められる
  return internalError({
    expose: false,
    cause: err,
  });
}

export function normalizeUnkhownIpcError(err: unknown, ipcName?: string): AppError {
  const normalizedError = normalizeUnknownError(err);
  const hasDetail = normalizedError.expose && normalizedError.message.trim() !== formatMessage('UNKNOWN_ERROR');
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

/**
 * AppError をクライアントに返せるプレーン JSON へ
 */
export function toPayload(e: AppError): AppErrorPayload {
  return {
    code: e.errorCode,
    message: e.expose ? e.message : formatMessage('UNKNOWN_ERROR'),
  };
}
