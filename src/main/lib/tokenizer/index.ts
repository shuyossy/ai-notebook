import type { ITokenizer } from './ITokenizer';
import { GptTokenizer } from './GptTokenizer';

export type { ITokenizer } from './ITokenizer';

// シングルトンキャッシュ（モデル名 → トークナイザインスタンス）
const tokenizerCache = new Map<string, ITokenizer>();

/**
 * モデル名に応じたトークナイザを取得するファクトリ関数
 * 現在は全モデルでGptTokenizerを使用するが、将来的にモデルに応じた切り替えが可能
 * @param modelName モデル名（省略時はデフォルトのGptTokenizerを返す）
 */
export function getTokenizer(modelName?: string): ITokenizer {
  const key = modelName ?? '__default__';
  const cached = tokenizerCache.get(key);
  if (cached) return cached;

  // 現在は全モデルでGptTokenizerを使用
  // 将来的にここでモデル名に応じた切り替えを実装
  const tokenizer = new GptTokenizer();
  tokenizerCache.set(key, tokenizer);
  return tokenizer;
}

/**
 * テスト用: キャッシュをクリアする
 */
export function clearTokenizerCache(): void {
  tokenizerCache.clear();
}
