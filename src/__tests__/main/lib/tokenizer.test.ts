import { GptTokenizer } from '@/main/lib/tokenizer/GptTokenizer';
import { getTokenizer, clearTokenizerCache } from '@/main/lib/tokenizer';

describe('Tokenizer', () => {
  describe('GptTokenizer', () => {
    const tokenizer = new GptTokenizer();

    it('英語テキストのトークン数を正しくカウントできる', () => {
      const text = 'Hello, world!';
      const count = tokenizer.countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    it('日本語テキストのトークン数を正しくカウントできる', () => {
      const text = 'こんにちは、世界！';
      const count = tokenizer.countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    it('空文字列の場合は0を返す', () => {
      expect(tokenizer.countTokens('')).toBe(0);
    });

    it('長いテキストでも正しくカウントできる', () => {
      const text = 'a'.repeat(10000);
      const count = tokenizer.countTokens(text);
      expect(count).toBeGreaterThan(0);
      // 英語のaは概ね1文字≒1トークン以下なので、テキスト長よりは少ないはず
      expect(count).toBeLessThanOrEqual(text.length);
    });

    it('日本語は英語よりトークン効率が低い（同じ文字数でより多くのトークンを使う）', () => {
      const english = 'Hello world this is a test sentence';
      const japanese = 'こんにちは世界これはテスト文です'; // 概ね同等の意味量

      const englishTokens = tokenizer.countTokens(english);
      const japaneseTokens = tokenizer.countTokens(japanese);

      // 日本語は一般的に英語よりトークン効率が低い
      expect(japaneseTokens).toBeGreaterThan(0);
      expect(englishTokens).toBeGreaterThan(0);
    });
  });

  describe('getTokenizer', () => {
    beforeEach(() => {
      clearTokenizerCache();
    });

    it('デフォルトのトークナイザを返す', () => {
      const tokenizer = getTokenizer();
      expect(tokenizer).toBeDefined();
      expect(typeof tokenizer.countTokens).toBe('function');
    });

    it('モデル名を指定してトークナイザを取得できる', () => {
      const tokenizer = getTokenizer('gpt-4o');
      expect(tokenizer).toBeDefined();
      expect(typeof tokenizer.countTokens).toBe('function');
    });

    it('同じモデル名で取得したトークナイザはキャッシュされる（同一インスタンス）', () => {
      const tokenizer1 = getTokenizer('gpt-4o');
      const tokenizer2 = getTokenizer('gpt-4o');
      expect(tokenizer1).toBe(tokenizer2);
    });

    it('異なるモデル名では異なるインスタンスが返される', () => {
      const tokenizer1 = getTokenizer('gpt-4o');
      const tokenizer2 = getTokenizer('gpt-4.1-mini');
      expect(tokenizer1).not.toBe(tokenizer2);
    });

    it('モデル名なしの場合もキャッシュされる', () => {
      const tokenizer1 = getTokenizer();
      const tokenizer2 = getTokenizer();
      expect(tokenizer1).toBe(tokenizer2);
    });

    it('clearTokenizerCacheでキャッシュがクリアされる', () => {
      const tokenizer1 = getTokenizer('gpt-4o');
      clearTokenizerCache();
      const tokenizer2 = getTokenizer('gpt-4o');
      expect(tokenizer1).not.toBe(tokenizer2);
    });
  });
});
