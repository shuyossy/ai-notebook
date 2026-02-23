/**
 * PdfjsDistStrategy のテスト
 * @jest-environment node
 */

// extractionUtils のモック
const mockExtractFromPdf = jest.fn();

jest.mock('@/main/lib/textExtractor/extractionUtils', () => ({
  extractFromPdf: (...args: any[]) => mockExtractFromPdf(...args),
}));

import { PdfjsDistStrategy } from '@/main/lib/textExtractor/strategies/PdfjsDistStrategy';

describe('PdfjsDistStrategy', () => {
  let strategy: PdfjsDistStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new PdfjsDistStrategy();
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.pdfであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.pdf']);
    });

    it('戦略タイプがpdfjs-distであること', () => {
      expect(strategy.getStrategyType()).toBe('pdfjs-dist');
    });

    it('フォーマットタイプがpdf-text-v1であること', () => {
      expect(strategy.getFormatType()).toBe('pdf-text-v1');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('PDFファイルからテキストが抽出されること', async () => {
        // Arrange
        mockExtractFromPdf.mockResolvedValue('PDF内容');

        // Act
        const result = await strategy.extract('/path/to/doc.pdf');

        // Assert
        expect(result.content).toBe('PDF内容');
        expect(result.images).toEqual([]);
        expect(mockExtractFromPdf).toHaveBeenCalledWith('/path/to/doc.pdf');
      });
    });

    describe('異常系', () => {
      it('PDF抽出エラーがそのままスローされること', async () => {
        // Arrange
        const error = new Error('PDF parse failed');
        mockExtractFromPdf.mockRejectedValue(error);

        // Act & Assert
        await expect(strategy.extract('/path/to/doc.pdf')).rejects.toThrow(
          error,
        );
      });
    });
  });
});
