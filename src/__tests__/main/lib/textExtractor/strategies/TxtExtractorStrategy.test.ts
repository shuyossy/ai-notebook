/**
 * TxtExtractorStrategy のテスト
 * @jest-environment node
 */

// extractionUtils のモック
const mockExtractFromTxt = jest.fn();

jest.mock('@/main/lib/textExtractor/extractionUtils', () => ({
  extractFromTxt: (...args: any[]) => mockExtractFromTxt(...args),
}));

import { TxtExtractorStrategy } from '@/main/lib/textExtractor/strategies/TxtExtractorStrategy';

describe('TxtExtractorStrategy', () => {
  let strategy: TxtExtractorStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new TxtExtractorStrategy();
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.txt, .csv, .mdであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual([
        '.txt',
        '.csv',
        '.md',
      ]);
    });

    it('戦略タイプがtxt-defaultであること', () => {
      expect(strategy.getStrategyType()).toBe('txt-default');
    });

    it('フォーマットタイプがtxt-plainであること', () => {
      expect(strategy.getFormatType()).toBe('txt-plain');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('テキストファイルからテキストが抽出されること', async () => {
        // Arrange
        mockExtractFromTxt.mockResolvedValue('抽出されたテキスト');

        // Act
        const result = await strategy.extract('/path/to/file.txt');

        // Assert
        expect(result.content).toBe('抽出されたテキスト');
        expect(result.images).toEqual([]);
        expect(mockExtractFromTxt).toHaveBeenCalledWith('/path/to/file.txt');
      });
    });

    describe('異常系', () => {
      it('ファイル読み込みエラーがそのままスローされること', async () => {
        // Arrange
        const error = new Error('ENOENT: file not found');
        mockExtractFromTxt.mockRejectedValue(error);

        // Act & Assert
        await expect(strategy.extract('/path/to/missing.txt')).rejects.toThrow(
          error,
        );
      });
    });
  });
});
