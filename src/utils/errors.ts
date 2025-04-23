// カスタムエラークラス
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// エラーコード定義
export const ErrorCodes = {
  CHAT: {
    FETCH_ROOMS_FAILED: 'CHAT/FETCH_ROOMS_FAILED',
    DELETE_ROOM_FAILED: 'CHAT/DELETE_ROOM_FAILED',
    CREATE_ROOM_FAILED: 'CHAT/CREATE_ROOM_FAILED',
  },
  SOURCE: {
    FETCH_FAILED: 'SOURCE/FETCH_FAILED',
    REGISTER_FAILED: 'SOURCE/REGISTER_FAILED',
    RELOAD_FAILED: 'SOURCE/RELOAD_FAILED',
  },
  SETTINGS: {
    LOAD_FAILED: 'SETTINGS/LOAD_FAILED',
    SAVE_FAILED: 'SETTINGS/SAVE_FAILED',
  },
  AGENT: {
    INITIALIZATION_FAILED: 'AGENT/INITIALIZATION_FAILED',
    EXECUTION_FAILED: 'AGENT/EXECUTION_FAILED',
  },
} as const;

// エラーメッセージ定義
export const ErrorMessages = {
  [ErrorCodes.CHAT.FETCH_ROOMS_FAILED]: 'チャットルームの取得に失敗しました',
  [ErrorCodes.CHAT.DELETE_ROOM_FAILED]: 'チャットルームの削除に失敗しました',
  [ErrorCodes.CHAT.CREATE_ROOM_FAILED]: 'チャットルームの作成に失敗しました',
  [ErrorCodes.SOURCE.FETCH_FAILED]: 'ソース情報の取得に失敗しました',
  [ErrorCodes.SOURCE.REGISTER_FAILED]: 'ソースの登録に失敗しました',
  [ErrorCodes.SOURCE.RELOAD_FAILED]: 'ソースの再読み込みに失敗しました',
  [ErrorCodes.SETTINGS.LOAD_FAILED]: '設定の読み込みに失敗しました',
  [ErrorCodes.SETTINGS.SAVE_FAILED]: '設定の保存に失敗しました',
  [ErrorCodes.AGENT.INITIALIZATION_FAILED]:
    'エージェントの初期化に失敗しました',
  [ErrorCodes.AGENT.EXECUTION_FAILED]: 'エージェントの実行に失敗しました',
} as const;

// エラーユーティリティ関数
export function createError(
  code: keyof typeof ErrorMessages,
  originalError?: unknown,
  additionalMessage?: string,
): AppError {
  const baseMessage = ErrorMessages[code];
  const message = additionalMessage
    ? `${baseMessage}: ${additionalMessage}`
    : baseMessage;
  return new AppError(message, code, originalError);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function formatError(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '不明なエラーが発生しました';
}
