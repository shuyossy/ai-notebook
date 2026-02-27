/**
 * AIモデル設定の一元管理
 * モデルオプションを追加する場合はこのファイルのMODEL_OPTIONSに追加する
 */

// 利用可能なAIモデルオプション
export const MODEL_OPTIONS = ['gpt-4.1-mini', 'gpt-4o', 'gpt-5'] as const;

// モデル名の型定義
export type ModelName = (typeof MODEL_OPTIONS)[number];

/**
 * モデル名が有効かどうかを判定する型ガード関数
 * @param value 検証する値
 * @returns 値が有効なモデル名の場合はtrue
 */
export const isValidModelName = (value: string): value is ModelName => {
  return MODEL_OPTIONS.includes(value as ModelName);
};

// デフォルトのモデル名
export const DEFAULT_MODEL: ModelName = 'gpt-4o';

// モデルごとのレート制限設定（1分間あたりのリクエスト上限）
export const MODEL_RATE_LIMITS: Record<string, number> = {
  'gpt-4.1-mini': 2,
  'gpt-4o': 20,
  'gpt-5': 10,
};
export const DEFAULT_RATE_LIMIT = 15;

// モデルごとの最大コンテキスト長（トークン数）
export const MODEL_MAX_CONTEXT_LENGTHS: Record<string, number> = {
  'gpt-4.1-mini': 8_000,
  'gpt-4o': 8_000,
  'gpt-5': 8_000,
};
export const DEFAULT_MAX_CONTEXT_LENGTH = 128_000;

/**
 * モデル名に対応する最大コンテキスト長を取得する
 * @param modelName モデル名
 * @returns 最大コンテキスト長（トークン数）
 */
export const getModelMaxContextLength = (modelName: string): number => {
  return MODEL_MAX_CONTEXT_LENGTHS[modelName] ?? DEFAULT_MAX_CONTEXT_LENGTH;
};

// モデルごとの最大画像数（1リクエストあたり）
export const MODEL_MAX_IMAGE_COUNTS: Record<string, number> = {
  'gpt-4.1-mini': 2,
  'gpt-4o': 20,
  'gpt-5': 50,
};
export const DEFAULT_MAX_IMAGE_COUNT = 20;

/**
 * モデル名に対応する最大画像数を取得する
 * @param modelName モデル名
 * @returns 最大画像数
 */
export const getModelMaxImageCount = (modelName: string): number => {
  return MODEL_MAX_IMAGE_COUNTS[modelName] ?? DEFAULT_MAX_IMAGE_COUNT;
};

// ReasoningEffortの選択肢
export const REASONING_EFFORT_OPTIONS = [
  'minimal',
  'low',
  'medium',
  'high',
] as const;

// ReasoningEffortの型定義
export type ReasoningEffort = (typeof REASONING_EFFORT_OPTIONS)[number];

// デフォルトのReasoningEffort
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'minimal';

/**
 * モデル名がgpt-5かどうかを判定する関数
 * gpt-5はtemperature:1を指定しないとエラーになるため、この判定が必要
 * @param modelName モデル名
 * @returns gpt-5の場合はtrue
 */
export const isGpt5Model = (modelName: string): boolean => {
  return modelName === 'gpt-5';
};
