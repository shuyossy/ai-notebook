import { FrontErrorCode, AppErrorPayload } from '@/types';

/**
 * 例外として扱うアプリケーションエラー。
 * - expose: true のときのみ message をクライアントに出す
 */
export class FrontAppError extends Error {
  public readonly expose: boolean;
  public readonly errorCode: FrontErrorCode;
  // ログに出すための追加情報
  public readonly couse?: unknown;

  constructor(
    errorCode: FrontErrorCode,
    message: string,
    options?: {
      expose?: boolean;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'FrontAppError';
    this.errorCode = errorCode;
    this.expose = options?.expose ?? false;
    this.couse = options?.cause;
  }

  override get message(): string {
    return this.expose ? super.message : '予期せぬエラーが発生しました';
  }
}

// よく使うビルダー
export const appApiError = (error: AppErrorPayload) =>
  new FrontAppError('APP_API', error.message, { expose: true });

export const appApiCallError = (error: unknown) =>
  new FrontAppError('APP_API_CALL', 'API通信に失敗しました', {
    expose: true,
    cause: error,
  });

export const internalError = (
  message: string,
  options?: {
    expose?: boolean;
    cause?: unknown;
  },
) => new FrontAppError('INTERNAL', message, options);

/**
 * 予期しない例外を AppError に正規化。
 * - 既に AppError → そのまま
 * - ZodError → VALIDATION に変換
 * - それ以外 → INTERNAL に丸める
 */
export function normalizeUnknownError(err: unknown): FrontAppError {
  if (err instanceof FrontAppError) return err;
  if (err instanceof Error) {
    return internalError(err.message, { expose: false, cause: err });
  }
  return internalError('予期せぬエラーが発生しました');
}

export function getSafeErrorMessage(err: unknown, title?: string): string {
  const normalizedError = normalizeUnknownError(err);
  if (normalizedError.errorCode === 'APP_API') {
    return normalizedError.message;
  }
  return title
    ? `${title}\n${normalizedError.message}`
    : normalizedError.message;
}
