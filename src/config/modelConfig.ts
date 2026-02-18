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
