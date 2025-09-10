/**
 * アプリ全体で使うエラーコード。
 * UI 側の文言切り替えや翻訳キーにも使えます。
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'EXTERNAL_SERVICE'
  | 'INTERNAL'
  | 'AI_API';

/**
 * フロントエンドで利用するエラーコード
 */
export type FrontErrorCode =
  | 'APP_API'
  | 'APP_API_CALL'
  | 'INTERNAL';

/**
 * クライアントへ返す標準エラー形
 * - code: アプリ内の安定したエラーコード
 * - message: ユーザー向けの安全なメッセージ
 */
export type AppErrorPayload = {
  code: ErrorCode;
  message: string;
};
