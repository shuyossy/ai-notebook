/**
 * PowerShellWordStrategy のテスト
 * @jest-environment node
 */

// extractionUtils のモック
const mockExtractViaPowerShell = jest.fn();

jest.mock('@/main/lib/textExtractor/extractionUtils', () => ({
  extractViaPowerShell: (...args: any[]) => mockExtractViaPowerShell(...args),
}));

import { PowerShellWordStrategy } from '@/main/lib/textExtractor/strategies/PowerShellWordStrategy';

describe('PowerShellWordStrategy', () => {
  let strategy: PowerShellWordStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new PowerShellWordStrategy();
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.docと.docxであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.doc', '.docx']);
    });

    it('戦略タイプがpowershell-wordであること', () => {
      expect(strategy.getStrategyType()).toBe('powershell-word');
    });

    it('フォーマットタイプがdocx-plainであること', () => {
      expect(strategy.getFormatType()).toBe('docx-plain');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('Word文書からテキストが抽出されること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('Word文書の内容');

        // Act
        const result = await strategy.extract('/path/to/doc.docx');

        // Assert
        expect(result.content).toBe('Word文書の内容');
        expect(result.images).toEqual([]);
        expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
          '/path/to/doc.docx',
          'word',
        );
      });
    });

    describe('異常系', () => {
      it('PowerShellエラーがそのままスローされること', async () => {
        // Arrange
        const error = new Error('PowerShell execution failed');
        mockExtractViaPowerShell.mockRejectedValue(error);

        // Act & Assert
        await expect(strategy.extract('/path/to/doc.docx')).rejects.toThrow(
          error,
        );
      });
    });
  });
});
