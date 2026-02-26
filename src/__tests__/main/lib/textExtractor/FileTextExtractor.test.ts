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

// extractionUtils のモック（プレーン戦略が内部で使用）
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

// リッチ戦略のモック（各戦略の extract メソッドを制御可能にする）
const mockDocxRichExtract = jest.fn();
const mockXlsxRichExtract = jest.fn();
const mockPptxRichExtract = jest.fn();
const mockPdfRichExtract = jest.fn();

jest.mock(
  '@/main/lib/textExtractor/strategies/DocxMammothRichStrategy',
  () => ({
    DocxMammothRichStrategy: jest.fn().mockImplementation(() => ({
      getSupportedExtensions: () => ['.docx'],
      getStrategyType: () => 'docx-mammoth-rich',
      getFormatType: () => 'docx-rich-v1',
      extract: mockDocxRichExtract,
    })),
  }),
);

jest.mock(
  '@/main/lib/textExtractor/strategies/XlsxSheetJsRichStrategy',
  () => ({
    XlsxSheetJsRichStrategy: jest.fn().mockImplementation(() => ({
      getSupportedExtensions: () => ['.xlsx'],
      getStrategyType: () => 'xlsx-sheetjs-rich',
      getFormatType: () => 'xlsx-rich-v1',
      extract: mockXlsxRichExtract,
    })),
  }),
);

jest.mock(
  '@/main/lib/textExtractor/strategies/PptxRichExtractorStrategy',
  () => ({
    PptxRichExtractorStrategy: jest.fn().mockImplementation(() => ({
      getSupportedExtensions: () => ['.pptx'],
      getStrategyType: () => 'pptx-rich',
      getFormatType: () => 'pptx-rich-v1',
      extract: mockPptxRichExtract,
    })),
  }),
);

jest.mock('@/main/lib/textExtractor/strategies/PdfjsRichStrategy', () => ({
  PdfjsRichStrategy: jest.fn().mockImplementation(() => ({
    getSupportedExtensions: () => ['.pdf'],
    getStrategyType: () => 'pdfjs-rich',
    getFormatType: () => 'pdf-rich-v1',
    extract: mockPdfRichExtract,
  })),
}));

import { FileTextExtractor } from '@/main/lib/textExtractor/FileTextExtractor';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';
import { AppError } from '@/main/lib/error';

describe('FileTextExtractor', () => {
  let extractor: FileTextExtractor;

  beforeEach(() => {
    jest.clearAllMocks();
    extractor = new FileTextExtractor();

    // デフォルト: リッチ戦略は TextExtractorStrategyError を投げる（フォールバック発動）
    mockDocxRichExtract.mockRejectedValue(
      new TextExtractorStrategyError('docx-mammoth-rich'),
    );
    mockXlsxRichExtract.mockRejectedValue(
      new TextExtractorStrategyError('xlsx-sheetjs-rich'),
    );
    mockPptxRichExtract.mockRejectedValue(
      new TextExtractorStrategyError('pptx-rich'),
    );
    mockPdfRichExtract.mockRejectedValue(
      new TextExtractorStrategyError('pdfjs-rich'),
    );
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

      it('Wordファイルのリッチ抽出が成功すること', async () => {
        // Arrange
        mockDocxRichExtract.mockResolvedValue({
          content: 'リッチWord内容',
          images: [
            {
              referenceId: 'img1.png',
              base64Data: 'data:image/png;base64,abc',
              mimeType: 'image/png',
            },
          ],
        });

        // Act
        const result = await extractor.extract('/test/doc.docx', 'doc.docx');

        // Assert
        expect(result.content).toBe('リッチWord内容');
        expect(result.images).toHaveLength(1);
        expect(result.strategyUsed).toBe('docx-mammoth-rich');
        expect(result.formatType).toBe('docx-rich-v1');
        expect(mockExtractViaPowerShell).not.toHaveBeenCalled();
      });

      it('Excelファイルのリッチ抽出が成功すること', async () => {
        // Arrange
        mockXlsxRichExtract.mockResolvedValue({
          content: 'リッチExcel内容',
          images: [],
        });

        // Act
        const result = await extractor.extract(
          '/test/sheet.xlsx',
          'sheet.xlsx',
        );

        // Assert
        expect(result.content).toBe('リッチExcel内容');
        expect(result.strategyUsed).toBe('xlsx-sheetjs-rich');
        expect(result.formatType).toBe('xlsx-rich-v1');
        expect(mockExtractViaPowerShell).not.toHaveBeenCalled();
      });

      it('PowerPointファイルのリッチ抽出が成功すること', async () => {
        // Arrange
        mockPptxRichExtract.mockResolvedValue({
          content: 'リッチPPTX内容',
          images: [],
        });

        // Act
        const result = await extractor.extract('/test/pres.pptx', 'pres.pptx');

        // Assert
        expect(result.content).toBe('リッチPPTX内容');
        expect(result.strategyUsed).toBe('pptx-rich');
        expect(result.formatType).toBe('pptx-rich-v1');
        expect(mockExtractViaPowerShell).not.toHaveBeenCalled();
      });

      it('PDFファイルのリッチ抽出が成功すること', async () => {
        // Arrange
        mockPdfRichExtract.mockResolvedValue({
          content: 'リッチPDF内容',
          images: [
            {
              referenceId: 'img1.png',
              base64Data: 'data:image/png;base64,xyz',
              mimeType: 'image/png',
            },
          ],
        });

        // Act
        const result = await extractor.extract('/test/doc.pdf', 'doc.pdf');

        // Assert
        expect(result.content).toBe('リッチPDF内容');
        expect(result.images).toHaveLength(1);
        expect(result.strategyUsed).toBe('pdfjs-rich');
        expect(result.formatType).toBe('pdf-rich-v1');
        expect(mockExtractFromPdf).not.toHaveBeenCalled();
      });

      it('Wordファイルのリッチ抽出が失敗した場合にプレーン戦略にフォールバックすること', async () => {
        // Arrange: リッチ戦略はデフォルトで失敗する（beforeEachで設定済み）
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

      it('Excelファイルのリッチ抽出が失敗した場合にプレーン戦略にフォールバックすること', async () => {
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

      it('PowerPointファイルのリッチ抽出が失敗した場合にプレーン戦略にフォールバックすること', async () => {
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

      it('PDFファイルのリッチ抽出が失敗した場合にプレーン戦略にフォールバックすること', async () => {
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

      it('CSVファイルの抽出が成功すること', async () => {
        // Arrange
        mockExtractFromTxt.mockResolvedValue('col1,col2\nval1,val2');

        // Act
        const result = await extractor.extract('/test/data.csv', 'data.csv');

        // Assert
        expect(result.content).toBe('col1,col2\nval1,val2');
        expect(result.images).toEqual([]);
        expect(result.strategyUsed).toBe('txt-default');
        expect(result.formatType).toBe('csv-plain');
        expect(mockExtractFromTxt).toHaveBeenCalledWith('/test/data.csv');
      });

      it('Markdownファイルの抽出が成功すること', async () => {
        // Arrange
        mockExtractFromTxt.mockResolvedValue('# 見出し\n\n本文テキスト');

        // Act
        const result = await extractor.extract('/test/readme.md', 'readme.md');

        // Assert
        expect(result.content).toBe('# 見出し\n\n本文テキスト');
        expect(result.images).toEqual([]);
        expect(result.strategyUsed).toBe('txt-default');
        expect(result.formatType).toBe('md-plain');
        expect(mockExtractFromTxt).toHaveBeenCalledWith('/test/readme.md');
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

      it('リッチ戦略でI/Oエラーが発生した場合はフォールバックせず即座にスローされること', async () => {
        // Arrange
        const ioError = new Error('ENOENT: file not found');
        mockDocxRichExtract.mockRejectedValue(ioError);

        // Act & Assert
        await expect(
          extractor.extract('/test/doc.docx', 'doc.docx'),
        ).rejects.toThrow(ioError);
        // プレーン戦略は呼ばれないこと
        expect(mockExtractViaPowerShell).not.toHaveBeenCalled();
      });

      it('戦略固有エラー（TextExtractorStrategyError）の場合はフォールバックを試みること', async () => {
        // Arrange
        // txtには1つしか戦略がないので、全戦略失敗→AppErrorスロー
        const strategyError = new TextExtractorStrategyError('txt-default');
        mockExtractFromTxt.mockRejectedValue(strategyError);

        // Act & Assert
        await expect(
          extractor.extract('/test/file.txt', 'file.txt'),
        ).rejects.toThrow(AppError);
      });

      it('リッチ戦略とプレーン戦略両方が戦略固有エラーで失敗した場合はAppErrorがスローされること', async () => {
        // Arrange: リッチ戦略はデフォルトで失敗する（beforeEachで設定済み）
        mockExtractViaPowerShell.mockRejectedValue(
          new TextExtractorStrategyError('powershell-word'),
        );

        // Act & Assert
        await expect(
          extractor.extract('/test/doc.docx', 'doc.docx'),
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
      expect(extractor.isSupported('.csv')).toBe(true);
      expect(extractor.isSupported('.md')).toBe(true);
      expect(extractor.isSupported('.pdf')).toBe(true);
    });

    it('サポートされていない拡張子の場合はfalseを返すこと', () => {
      expect(extractor.isSupported('.zip')).toBe(false);
    });
  });

  describe('フォールバック統合テスト', () => {
    it('.xlsxでリッチ戦略失敗時にplain戦略にフォールバックすること', async () => {
      // Arrange: リッチ戦略はデフォルトで失敗する（beforeEachで設定済み）
      mockExtractViaPowerShell.mockResolvedValue('Excel plain content');

      // Act
      const result = await extractor.extract('/test/sheet.xlsx', 'sheet.xlsx');

      // Assert
      expect(mockXlsxRichExtract).toHaveBeenCalled();
      expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
        '/test/sheet.xlsx',
        'excel',
      );
      expect(result.strategyUsed).toBe('powershell-excel');
      expect(result.formatType).toBe('xlsx-csv-v1');
      expect(result.content).toBe('Excel plain content');
    });

    it('.pptxでリッチ戦略失敗時にplain戦略にフォールバックすること', async () => {
      // Arrange: リッチ戦略はデフォルトで失敗する（beforeEachで設定済み）
      mockExtractViaPowerShell.mockResolvedValue('PPT plain content');

      // Act
      const result = await extractor.extract('/test/pres.pptx', 'pres.pptx');

      // Assert
      expect(mockPptxRichExtract).toHaveBeenCalled();
      expect(mockExtractViaPowerShell).toHaveBeenCalledWith(
        '/test/pres.pptx',
        'ppt',
      );
      expect(result.strategyUsed).toBe('powershell-ppt');
      expect(result.formatType).toBe('pptx-plain');
      expect(result.content).toBe('PPT plain content');
    });

    it('.pdfでリッチ戦略失敗時にplain戦略にフォールバックすること', async () => {
      // Arrange: リッチ戦略はデフォルトで失敗する（beforeEachで設定済み）
      mockExtractFromPdf.mockResolvedValue('PDF plain content');

      // Act
      const result = await extractor.extract('/test/doc.pdf', 'doc.pdf');

      // Assert
      expect(mockPdfRichExtract).toHaveBeenCalled();
      expect(mockExtractFromPdf).toHaveBeenCalledWith('/test/doc.pdf');
      expect(result.strategyUsed).toBe('pdfjs-dist');
      expect(result.formatType).toBe('pdf-text-v1');
      expect(result.content).toBe('PDF plain content');
    });
  });
});
