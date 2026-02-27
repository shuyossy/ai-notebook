import { encode } from 'gpt-tokenizer';
import type { ITokenizer } from './ITokenizer';

/**
 * OpenAI GPTモデル用トークナイザ実装
 * gpt-tokenizerを使用してトークン数を算出する
 */
export class GptTokenizer implements ITokenizer {
  countTokens(text: string): number {
    if (!text) return 0;
    return encode(text).length;
  }
}
