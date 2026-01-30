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
