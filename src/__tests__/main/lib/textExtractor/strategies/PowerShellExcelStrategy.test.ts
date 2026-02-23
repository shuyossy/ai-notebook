/**
 * PowerShellExcelStrategy のテスト
 * @jest-environment node
 */

// extractionUtils のモック
const mockExtractViaPowerShell = jest.fn();

jest.mock('@/main/lib/textExtractor/extractionUtils', () => ({
  extractViaPowerShell: (...args: any[]) => mockExtractViaPowerShell(...args),
}));

import { PowerShellExcelStrategy } from '@/main/lib/textExtractor/strategies/PowerShellExcelStrategy';

describe('PowerShellExcelStrategy', () => {
  let strategy: PowerShellExcelStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new PowerShellExcelStrategy();
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.xlsと.xlsxであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.xls', '.xlsx']);
    });

    it('戦略タイプがpowershell-excelであること', () => {
      expect(strategy.getStrategyType()).toBe('powershell-excel');
    });

    it('フォーマットタイプがxlsx-csv-v1であること', () => {
      expect(strategy.getFormatType()).toBe('xlsx-csv-v1');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('Excelファイルからテキストが抽出されること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('Excel内容');

        // Act
        const result = await strategy.extract('/path/to/sheet.xlsx');

        // Assert
        expect(result.content).toBe('Excel内容');
        expect(result.images).toEqual([]);
        expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
          '/path/to/sheet.xlsx',
          'excel',
        );
      });
    });

    describe('異常系', () => {
      it('PowerShellエラーがそのままスローされること', async () => {
        // Arrange
        const error = new Error('PowerShell execution failed');
        mockExtractViaPowerShell.mockRejectedValue(error);

        // Act & Assert
        await expect(strategy.extract('/path/to/sheet.xlsx')).rejects.toThrow(
          error,
        );
      });
    });
  });
});
