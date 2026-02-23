/**
 * FileTextExtractor のテスト
 * @jest-environment node
 */

// Electron モックを最初に適用
jest.mock(
  'electron',
  () => require('../../test-utils/mockElectron').mockElectron,
);
jest.mock(
  'electron-store',
  () => require('../../test-utils/mockElectron').default,
);
jest.mock('@/main/main', () => {
  const path = require('path');
  const os = require('os');
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test');
  return { getCustomAppDataDir: jest.fn(() => testAppData) };
});

// extractionUtils のモック
const mockExtractFromTxt = jest.fn();
const mockExtractViaPowerShell = jest.fn();
const mockExtractFromPdf = jest.fn();

jest.mock('@/main/lib/textExtractor/extractionUtils', () => ({
  normalizeExtractedText: jest.fn((text: string) => text.trim()),
  extractFromTxt: (...args: any[]) => mockExtractFromTxt(...args),
  extractViaPowerShell: (...args: any[]) => mockExtractViaPowerShell(...args),
  extractFromPdf: (...args: any[]) => mockExtractFromPdf(...args),
  DEFAULT_POST_PROCESS_POLICY: {},
}));

import { FileTextExtractor } from '@/main/lib/textExtractor/FileTextExtractor';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';
import { AppError } from '@/main/lib/error';

describe('FileTextExtractor', () => {
  let extractor: FileTextExtractor;

  beforeEach(() => {
    jest.clearAllMocks();
    extractor = new FileTextExtractor();
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('テキストファイルの抽出が成功すること', async () => {
        // Arrange
        mockExtractFromTxt.mockResolvedValue('テストテキスト');

        // Act
        const result = await extractor.extract('/test/file.txt', 'file.txt');

        // Assert
        expect(result.content).toBe('テストテキスト');
        expect(result.images).toEqual([]);
        expect(result.strategyUsed).toBe('txt-default');
        expect(result.formatType).toBe('txt-plain');
        expect(mockExtractFromTxt).toHaveBeenCalledWith('/test/file.txt');
      });

      it('Wordファイルの抽出が成功すること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('Word文書の内容');

        // Act
        const result = await extractor.extract('/test/doc.docx', 'doc.docx');

        // Assert
        expect(result.content).toBe('Word文書の内容');
        expect(result.strategyUsed).toBe('powershell-word');
        expect(result.formatType).toBe('docx-plain');
        expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
          '/test/doc.docx',
          'word',
        );
      });

      it('Excelファイルの抽出が成功すること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('Excel内容');

        // Act
        const result = await extractor.extract(
          '/test/sheet.xlsx',
          'sheet.xlsx',
        );

        // Assert
        expect(result.strategyUsed).toBe('powershell-excel');
        expect(result.formatType).toBe('xlsx-csv-v1');
        expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
          '/test/sheet.xlsx',
          'excel',
        );
      });

      it('PowerPointファイルの抽出が成功すること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('スライド内容');

        // Act
        const result = await extractor.extract('/test/pres.pptx', 'pres.pptx');

        // Assert
        expect(result.strategyUsed).toBe('powershell-ppt');
        expect(result.formatType).toBe('pptx-plain');
        expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
          '/test/pres.pptx',
          'ppt',
        );
      });

      it('PDFファイルの抽出が成功すること', async () => {
        // Arrange
        mockExtractFromPdf.mockResolvedValue('PDF内容');

        // Act
        const result = await extractor.extract('/test/doc.pdf', 'doc.pdf');

        // Assert
        expect(result.strategyUsed).toBe('pdfjs-dist');
        expect(result.formatType).toBe('pdf-text-v1');
        expect(mockExtractFromPdf).toHaveBeenCalledWith('/test/doc.pdf');
      });

      it('.doc拡張子でもWord戦略が選択されること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('旧Word内容');

        // Act
        const result = await extractor.extract('/test/old.doc', 'old.doc');

        // Assert
        expect(result.strategyUsed).toBe('powershell-word');
      });

      it('.xls拡張子でもExcel戦略が選択されること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('旧Excel内容');

        // Act
        const result = await extractor.extract('/test/old.xls', 'old.xls');

        // Assert
        expect(result.strategyUsed).toBe('powershell-excel');
      });

      it('.ppt拡張子でもPowerPoint戦略が選択されること', async () => {
        // Arrange
        mockExtractViaPowerShell.mockResolvedValue('旧PPT内容');

        // Act
        const result = await extractor.extract('/test/old.ppt', 'old.ppt');

        // Assert
        expect(result.strategyUsed).toBe('powershell-ppt');
      });

      it('大文字拡張子でも正しい戦略が選択されること', async () => {
        // Arrange
        mockExtractFromTxt.mockResolvedValue('テスト');

        // Act
        const result = await extractor.extract('/test/FILE.TXT', 'FILE.TXT');

        // Assert
        expect(result.strategyUsed).toBe('txt-default');
      });

      it('正規化処理が適用されること', async () => {
        // Arrange
        mockExtractFromTxt.mockResolvedValue('  テストテキスト  ');

        // Act
        const result = await extractor.extract('/test/file.txt', 'file.txt');

        // Assert
        // normalizeExtractedText のモックが trim() を適用
        expect(result.content).toBe('テストテキスト');
      });
    });

    describe('異常系', () => {
      it('サポートされていない拡張子の場合はエラーがスローされること', async () => {
        // Act & Assert
        await expect(
          extractor.extract('/test/file.zip', 'file.zip'),
        ).rejects.toThrow(AppError);
      });

      it('ファイルI/Oエラーの場合はフォールバックせず即座にスローされること', async () => {
        // Arrange
        const ioError = new Error('ENOENT: file not found');
        mockExtractFromTxt.mockRejectedValue(ioError);

        // Act & Assert
        await expect(
          extractor.extract('/test/file.txt', 'file.txt'),
        ).rejects.toThrow(ioError);
      });

      it('戦略固有エラー（TextExtractorStrategyError）の場合はフォールバックを試みること', async () => {
        // Arrange
        // この時点ではtxtには1つしか戦略がないので、全戦略失敗→AppErrorスロー
        const strategyError = new TextExtractorStrategyError('txt-default');
        mockExtractFromTxt.mockRejectedValue(strategyError);

        // Act & Assert
        await expect(
          extractor.extract('/test/file.txt', 'file.txt'),
        ).rejects.toThrow(AppError);
      });
    });
  });

  describe('getAvailableStrategies', () => {
    it('テキストファイルの利用可能戦略が返ること', () => {
      const strategies = extractor.getAvailableStrategies('.txt');
      expect(strategies).toEqual(['txt-default']);
    });

    it('サポートされていない拡張子の場合は空配列を返すこと', () => {
      const strategies = extractor.getAvailableStrategies('.zip');
      expect(strategies).toEqual([]);
    });
  });

  describe('isSupported', () => {
    it('サポートされている拡張子の場合はtrueを返すこと', () => {
      expect(extractor.isSupported('.txt')).toBe(true);
      expect(extractor.isSupported('.pdf')).toBe(true);
    });

    it('サポートされていない拡張子の場合はfalseを返すこと', () => {
      expect(extractor.isSupported('.zip')).toBe(false);
    });
  });
});
