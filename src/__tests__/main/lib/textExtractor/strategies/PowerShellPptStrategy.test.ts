/**
 * PowerShellPptStrategy のテスト
 * @jest-environment node
 */

// extractionUtils のモック
const mockExtractViaPowerShell = jest.fn();

jest.mock('@/main/lib/textExtractor/extractionUtils', () => ({
  extractViaPowerShell: (...args: any[]) => mockExtractViaPowerShell(...args),
}));

import { PowerShellPptStrategy } from '@/main/lib/textExtractor/strategies/PowerShellPptStrategy';

describe('PowerShellPptStrategy', () => {
  let strategy: PowerShellPptStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new PowerShellPptStrategy();
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.pptと.pptxであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.ppt', '.pptx']);
    });

    it('戦略タイプがpowershell-pptであること', () => {
      expect(strategy.getStrategyType()).toBe('powershell-ppt');
    });

    it('フォーマットタイプがpptx-plainであること', () => {
      expect(strategy.getFormatType()).toBe('pptx-plain');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('PowerPointファイルからテキストが抽出されること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('スライド内容');

        // Act
        const result = await strategy.extract('/path/to/pres.pptx');

        // Assert
        expect(result.content).toBe('スライド内容');
        expect(result.images).toEqual([]);
        expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
          '/path/to/pres.pptx',
          'ppt',
        );
      });
    });

    describe('異常系', () => {
      it('PowerShellエラーがそのままスローされること', async () => {
        // Arrange
        const error = new Error('PowerShell execution failed');
        mockExtractViaPowerShell.mockRejectedValue(error);

        // Act & Assert
        await expect(strategy.extract('/path/to/pres.pptx')).rejects.toThrow(
          error,
        );
      });
    });
  });
});
