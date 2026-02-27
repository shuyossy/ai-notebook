/**
 * トークナイザのインターフェース
 * 将来的にモデルに応じたトークナイザの切り替えを可能にする
 */
export interface ITokenizer {
  countTokens(text: string): number;
}
