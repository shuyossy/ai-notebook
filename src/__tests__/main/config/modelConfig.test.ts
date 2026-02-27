import {
  getModelMaxContextLength,
  MODEL_MAX_CONTEXT_LENGTHS,
  DEFAULT_MAX_CONTEXT_LENGTH,
  getModelMaxImageCount,
  MODEL_MAX_IMAGE_COUNTS,
  DEFAULT_MAX_IMAGE_COUNT,
} from '@/config/modelConfig';

describe('modelConfig', () => {
  describe('getModelMaxContextLength', () => {
    it('gpt-4oのコンテキスト長を正しく返す', () => {
      expect(getModelMaxContextLength('gpt-4o')).toBe(128_000);
    });

    it('gpt-4.1-miniのコンテキスト長を正しく返す', () => {
      expect(getModelMaxContextLength('gpt-4.1-mini')).toBe(1_047_576);
    });

    it('gpt-5のコンテキスト長を正しく返す', () => {
      expect(getModelMaxContextLength('gpt-5')).toBe(1_047_576);
    });

    it('未知のモデル名の場合はデフォルト値を返す', () => {
      expect(getModelMaxContextLength('unknown-model')).toBe(
        DEFAULT_MAX_CONTEXT_LENGTH,
      );
    });

    it('空文字の場合はデフォルト値を返す', () => {
      expect(getModelMaxContextLength('')).toBe(DEFAULT_MAX_CONTEXT_LENGTH);
    });
  });

  describe('MODEL_MAX_CONTEXT_LENGTHS', () => {
    it('定義されたモデルが全て正の数値を持つ', () => {
      for (const [model, length] of Object.entries(MODEL_MAX_CONTEXT_LENGTHS)) {
        expect(length).toBeGreaterThan(0);
      }
    });
  });

  describe('getModelMaxImageCount', () => {
    it('gpt-4oの最大画像数を正しく返す', () => {
      expect(getModelMaxImageCount('gpt-4o')).toBe(20);
    });

    it('gpt-4.1-miniの最大画像数を正しく返す', () => {
      expect(getModelMaxImageCount('gpt-4.1-mini')).toBe(20);
    });

    it('gpt-5の最大画像数を正しく返す', () => {
      expect(getModelMaxImageCount('gpt-5')).toBe(50);
    });

    it('未知のモデル名の場合はデフォルト値を返す', () => {
      expect(getModelMaxImageCount('unknown-model')).toBe(
        DEFAULT_MAX_IMAGE_COUNT,
      );
    });

    it('空文字の場合はデフォルト値を返す', () => {
      expect(getModelMaxImageCount('')).toBe(DEFAULT_MAX_IMAGE_COUNT);
    });
  });

  describe('MODEL_MAX_IMAGE_COUNTS', () => {
    it('定義されたモデルが全て正の数値を持つ', () => {
      for (const [model, count] of Object.entries(MODEL_MAX_IMAGE_COUNTS)) {
        expect(count).toBeGreaterThan(0);
      }
    });
  });
});
