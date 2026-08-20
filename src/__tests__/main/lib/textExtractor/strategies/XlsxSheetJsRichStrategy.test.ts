/**
 * XlsxSheetJsRichStrategy のテスト
 * @jest-environment node
 */

// ---------- モック定義（importより前に配置） ----------

// fs/promises モック
const mockReadFile = jest.fn();
jest.mock('fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}));

// logger モック（electron依存を回避）
const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();
jest.mock('@/main/lib/logger', () => ({
  getMainLogger: () => ({
    warn: (...args: any[]) => mockLoggerWarn(...args),
    debug: (...args: any[]) => mockLoggerDebug(...args),
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

// XlsxDrawingParser クラスモック
const mockParseRelationships = jest.fn();
const mockResolveRelativePath = jest.fn();
const mockParseImages = jest.fn();
const mockParseShapeTexts = jest.fn();
const mockParseConnectors = jest.fn();
const mockResolveImagePaths = jest.fn();

// XlsxDrawingParser ユーティリティ関数モック
const mockFormatImageTag = jest.fn();
const mockFormatDrawingTagFull = jest.fn();
const mockFormatDrawingTagShort = jest.fn();
const mockGetArrowSymbol = jest.fn();
const mockResolveConnectorEndpoints = jest.fn();

jest.mock('@/main/lib/textExtractor/XlsxDrawingParser', () => ({
  DRAWING_RELATIONSHIP_TYPE:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
  DRAWING_RELATIONSHIP_TYPE_STRICT:
    'http://purl.oclc.org/ooxml/officeDocument/relationships/drawing',
  XlsxDrawingParser: jest.fn().mockImplementation(() => ({
    parseRelationships: (...args: any[]) => mockParseRelationships(...args),
    resolveRelativePath: (...args: any[]) => mockResolveRelativePath(...args),
    parseImages: (...args: any[]) => mockParseImages(...args),
    parseShapeTexts: (...args: any[]) => mockParseShapeTexts(...args),
    parseConnectors: (...args: any[]) => mockParseConnectors(...args),
    resolveImagePaths: (...args: any[]) => mockResolveImagePaths(...args),
  })),
  formatImageTag: (...args: any[]) => mockFormatImageTag(...args),
  formatDrawingTagFull: (...args: any[]) => mockFormatDrawingTagFull(...args),
  formatDrawingTagShort: (...args: any[]) => mockFormatDrawingTagShort(...args),
  getArrowSymbol: (...args: any[]) => mockGetArrowSymbol(...args),
  resolveConnectorEndpoints: (...args: any[]) =>
    mockResolveConnectorEndpoints(...args),
}));

// mimeUtils モック
const mockGetMimeFromExt = jest.fn();
const mockIsAiSupportedImageExtension = jest.fn();
jest.mock('@/main/lib/textExtractor/mimeUtils', () => ({
  getMimeFromExt: (...args: any[]) => mockGetMimeFromExt(...args),
  isAiSupportedImageExtension: (...args: any[]) => mockIsAiSupportedImageExtension(...args),
}));

// JSZip モック
const mockZipFile = jest.fn();
const mockZipFolder = jest.fn();
const mockZipLoadAsync = jest.fn();
jest.mock('jszip', () => ({
  __esModule: true,
  default: {
    loadAsync: (...args: any[]) => mockZipLoadAsync(...args),
  },
}));

// XLSX モック
const mockXlsxRead = jest.fn();
const mockSheetToCsv = jest.fn();
const mockDecodeRange = jest.fn();
jest.mock('xlsx', () => ({
  read: (...args: any[]) => mockXlsxRead(...args),
  utils: {
    sheet_to_csv: (...args: any[]) => mockSheetToCsv(...args),
    decode_range: (...args: any[]) => mockDecodeRange(...args),
  },
}));

// cheerio モック（buildSheetFileMappingFromWorkbook内で利用）
const mockCheerioLoad = jest.fn();
jest.mock('cheerio', () => ({
  load: (...args: any[]) => mockCheerioLoad(...args),
}));

// ---------- テスト対象のインポート ----------
import { XlsxSheetJsRichStrategy } from '@/main/lib/textExtractor/strategies/XlsxSheetJsRichStrategy';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';

// ---------- ヘルパー ----------

/** 最小限のJSZipオブジェクトを生成するヘルパー */
function createMockZip(overrides?: { file?: jest.Mock; folder?: jest.Mock }) {
  const file = overrides?.file ?? mockZipFile;
  const folder = overrides?.folder ?? mockZipFolder;
  return { file, folder };
}

/** forEach付きフォルダオブジェクトのヘルパー */
function createMockFolder(files: { relativePath: string; dir: boolean }[]) {
  return {
    forEach: (cb: (relativePath: string, file: { dir: boolean }) => void) => {
      for (const f of files) {
        cb(f.relativePath, { dir: f.dir });
      }
    },
  };
}

/** ZIP内のasyncを返すファイルオブジェクトのヘルパー */
function createMockZipFileEntry(
  content: string | Buffer,
  _type: 'string' | 'nodebuffer' = 'string',
) {
  return {
    async: jest.fn((t: string) => {
      if (t === 'string') {
        return Promise.resolve(
          typeof content === 'string' ? content : content.toString(),
        );
      }
      if (t === 'nodebuffer') {
        return Promise.resolve(
          Buffer.isBuffer(content) ? content : Buffer.from(content),
        );
      }
      return Promise.resolve(content);
    }),
    dir: false,
  };
}

// ---------- テスト ----------

describe('XlsxSheetJsRichStrategy', () => {
  let strategy: XlsxSheetJsRichStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new XlsxSheetJsRichStrategy();

    // デフォルトのモック設定
    mockGetMimeFromExt.mockReturnValue('image/png');
    mockIsAiSupportedImageExtension.mockReturnValue(true);
    mockFormatImageTag.mockImplementation((refId: string, cellRange?: any) =>
      cellRange ? `![image at A1-C3](${refId})` : `![image](${refId})`,
    );
    mockFormatDrawingTagFull.mockImplementation((id: string) => `[${id}]`);
    mockFormatDrawingTagShort.mockImplementation((id: string) => `[${id}]`);
    mockGetArrowSymbol.mockReturnValue('->');
    mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 10 } });
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.xlsxであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.xlsx']);
    });

    it('戦略タイプがxlsx-sheetjs-richであること', () => {
      expect(strategy.getStrategyType()).toBe('xlsx-sheetjs-rich');
    });

    it('フォーマットタイプがxlsx-rich-v2であること', () => {
      expect(strategy.getFormatType()).toBe('xlsx-rich-v2');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('基本的なCSV抽出が成功すること（描画情報なし）', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // JSZip: 描画なしの最小構成
        const zip = createMockZip();
        zip.folder.mockReturnValue(null); // シートリレーションフォルダなし
        zip.file.mockReturnValue(null);
        mockZipLoadAsync.mockResolvedValue(zip);

        // XLSX
        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C\n1,2,3\n,,');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 2 } });

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(result.content).toContain('#sheet:Sheet1');
        expect(result.content).toContain('[row1] A,B,C');
        expect(result.content).toContain('[row2] 1,2,3');
        expect(result.images).toEqual([]);
        expect(mockReadFile).toHaveBeenCalledWith('/path/to/test.xlsx');
      });

      it('画像付きシートの抽出が成功すること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // JSZip
        const relsFileEntry = createMockZipFileEntry(
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
        );
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');
        const drawingRelsFileEntry = createMockZipFileEntry(
          '<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>',
        );
        const imageFileEntry = createMockZipFileEntry(
          Buffer.from('PNG_DATA'),
          'nodebuffer',
        );

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/drawings/_rels/drawing1.xml.rels': drawingRelsFileEntry,
          'xl/media/image1.png': imageFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        // XLSX
        const sheetData = { '!ref': 'A1:C5' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C\n1,2,3');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 1 } });

        // DrawingParser
        mockParseRelationships.mockImplementation((xml: string) => {
          if (xml.includes('drawing')) {
            return [
              {
                rId: 'rId1',
                target: '../drawings/drawing1.xml',
                type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
              },
            ];
          }
          return [{ rId: 'rId1', target: '../media/image1.png' }];
        });
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([
          {
            rId: 'rId1',
            rowIndex: 0,
            cellRange: { fromCol: 0, fromRow: 0, toCol: 2, toRow: 2 },
          },
        ]);
        mockResolveImagePaths.mockReturnValue(
          new Map([['rId1', 'xl/media/image1.png']]),
        );
        mockParseShapeTexts.mockReturnValue([]);
        mockParseConnectors.mockReturnValue([]);
        mockFormatImageTag.mockReturnValue('![image at A1-C3](image_1.png)');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(result.content).toContain('#sheet:Sheet1');
        expect(result.content).toContain('![image at A1-C3](image_1.png)');
        expect(result.images).toHaveLength(1);
        expect(result.images[0].referenceId).toBe('image_1.png');
        expect(result.images[0].mimeType).toBe('image/png');
        expect(result.images[0].base64Data).toContain('data:image/png;base64,');
      });

      it('図形テキスト付きシートの抽出が成功すること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // JSZip
        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        // XLSX
        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        // DrawingParser
        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        mockParseShapeTexts.mockReturnValue([
          {
            text: 'Shape Text',
            rowIndex: 0,
            metadata: {
              presetGeometry: 'rect',
              cellRange: { fromCol: 0, fromRow: 0, toCol: 2, toRow: 2 },
            },
            drawingObjectId: 5,
          },
        ]);
        mockParseConnectors.mockReturnValue([]);
        mockFormatDrawingTagFull.mockReturnValue('[s1:rect@A1-C3]');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(result.content).toContain('[s1:rect@A1-C3] Shape Text');
        expect(result.images).toEqual([]);
      });

      it('複数行の図形テキストが正しくフォーマットされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:A1' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('Data');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        mockParseShapeTexts.mockReturnValue([
          {
            text: 'Line1\nLine2\nLine3',
            rowIndex: 0,
            metadata: { presetGeometry: 'rect' },
          },
        ]);
        mockParseConnectors.mockReturnValue([]);
        mockFormatDrawingTagFull.mockReturnValue('[s1:rect]');
        mockFormatDrawingTagShort.mockReturnValue('[s1]');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(result.content).toContain('[s1:rect] Line1');
        expect(result.content).toContain('[s1] Line2');
        expect(result.content).toContain('[s1] Line3');
      });

      it('コネクタ付きシートの抽出が成功すること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        // 先に図形を登録してdrawingObjectIdをマッピングに登録
        mockParseShapeTexts.mockReturnValue([
          {
            text: 'Start',
            rowIndex: 0,
            metadata: { presetGeometry: 'rect' },
            drawingObjectId: 10,
          },
          {
            text: 'End',
            rowIndex: 0,
            metadata: { presetGeometry: 'rect' },
            drawingObjectId: 20,
          },
        ]);
        mockParseConnectors.mockReturnValue([
          {
            rowIndex: 0,
            metadata: { presetGeometry: 'straightConnector1' },
            startConnection: { drawingObjectId: 10, connectionSiteIndex: 0 },
            endConnection: { drawingObjectId: 20, connectionSiteIndex: 0 },
            headEndType: 'none',
            tailEndType: 'triangle',
          },
        ]);
        mockGetArrowSymbol.mockReturnValue('->');
        mockFormatDrawingTagFull.mockImplementation(
          (id: string, _meta?: any, connPart?: string) =>
            connPart ? `[${id} ${connPart}]` : `[${id}]`,
        );

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        // shape1(Start), shape2(End), connector3のコネクタが生成される
        expect(result.content).toContain('#sheet:Sheet1');
        expect(mockGetArrowSymbol).toHaveBeenCalledWith('none', 'triangle');
        expect(mockFormatDrawingTagFull).toHaveBeenCalledWith(
          'connector3',
          { presetGeometry: 'straightConnector1' },
          'shape1->shape2',
        );
      });

      it('コネクタの接続先が未解決の場合セル範囲から算出されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        mockParseShapeTexts.mockReturnValue([]);
        mockParseConnectors.mockReturnValue([
          {
            rowIndex: 0,
            metadata: {
              presetGeometry: 'straightConnector1',
              cellRange: { fromCol: 0, fromRow: 2, toCol: 3, toRow: 5 },
            },
            headEndType: 'none',
            tailEndType: 'triangle',
          },
        ]);
        mockGetArrowSymbol.mockReturnValue('->');
        mockResolveConnectorEndpoints.mockReturnValue(['A3', 'D6']);
        mockFormatDrawingTagFull.mockImplementation(
          (id: string, _meta?: any, connPart?: string) =>
            connPart ? `[${id} ${connPart}]` : `[${id}]`,
        );

        // Act
        await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(mockResolveConnectorEndpoints).toHaveBeenCalledWith(
          { fromCol: 0, fromRow: 2, toCol: 3, toRow: 5 },
          undefined,
          undefined,
        );
        expect(mockFormatDrawingTagFull).toHaveBeenCalledWith(
          'connector1',
          {
            presetGeometry: 'straightConnector1',
            cellRange: { fromCol: 0, fromRow: 2, toCol: 3, toRow: 5 },
          },
          'A3->D6',
        );
      });

      it('コネクタの片方のみ接続先が解決できる場合、未解決側がセル範囲から算出されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        // shape1を登録（drawingObjectId=10）
        mockParseShapeTexts.mockReturnValue([
          {
            text: 'Start',
            rowIndex: 0,
            metadata: { presetGeometry: 'rect' },
            drawingObjectId: 10,
          },
        ]);
        // startConnectionのみ解決可能、endConnectionは未設定
        mockParseConnectors.mockReturnValue([
          {
            rowIndex: 0,
            metadata: {
              presetGeometry: 'straightConnector1',
              cellRange: { fromCol: 0, fromRow: 2, toCol: 3, toRow: 5 },
            },
            startConnection: { drawingObjectId: 10, connectionSiteIndex: 0 },
            headEndType: 'none',
            tailEndType: 'triangle',
          },
        ]);
        mockGetArrowSymbol.mockReturnValue('->');
        mockResolveConnectorEndpoints.mockReturnValue(['A3', 'D6']);
        mockFormatDrawingTagFull.mockImplementation(
          (id: string, _meta?: any, connPart?: string) =>
            connPart ? `[${id} ${connPart}]` : `[${id}]`,
        );

        // Act
        await strategy.extract('/path/to/test.xlsx');

        // Assert
        // startLabel=shape1（解決済み）、endLabel=D6（セル範囲から）
        expect(mockFormatDrawingTagFull).toHaveBeenCalledWith(
          'connector2',
          {
            presetGeometry: 'straightConnector1',
            cellRange: { fromCol: 0, fromRow: 2, toCol: 3, toRow: 5 },
          },
          'shape1->D6',
        );
      });

      it('[rowN]マーカーが正しく付与されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        zip.folder.mockReturnValue(null);
        zip.file.mockReturnValue(null);
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A3:C5' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        // rangeStartRowが2（A3の0ベース行インデックス）
        mockDecodeRange.mockReturnValue({ s: { r: 2 }, e: { r: 4 } });
        mockSheetToCsv.mockReturnValue('X,Y,Z\n1,2,3\n4,5,6');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        // rangeStartRow=2なので、行番号はExcel行3,4,5になる
        expect(result.content).toContain('[row3] X,Y,Z');
        expect(result.content).toContain('[row4] 1,2,3');
        expect(result.content).toContain('[row5] 4,5,6');
      });

      it('空行にはマーカーが付与されないこと', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        zip.folder.mockReturnValue(null);
        zip.file.mockReturnValue(null);
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 2 } });
        // 2行目がカンマのみの空行
        mockSheetToCsv.mockReturnValue('A,B,C\n,,\n1,2,3');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        const lines = result.content.split('\n');
        // #sheet:Sheet1, [row1] A,B,C, (空行), [row3] 1,2,3
        expect(lines).toContain('[row1] A,B,C');
        expect(lines).toContain(',,');
        expect(lines).toContain('[row3] 1,2,3');
        // 空行には[rowN]が付与されていないことを確認
        expect(lines.find((l) => l.includes('[row2]'))).toBeUndefined();
      });

      it('シートにsheetデータがnullの場合スキップされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        zip.folder.mockReturnValue(null);
        zip.file.mockReturnValue(null);
        mockZipLoadAsync.mockResolvedValue(zip);

        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1', 'Sheet2'],
          Sheets: { Sheet1: null, Sheet2: { '!ref': 'A1:A1' } },
        });
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });
        mockSheetToCsv.mockReturnValue('Data');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(result.content).not.toContain('#sheet:Sheet1');
        expect(result.content).toContain('#sheet:Sheet2');
      });

      it('!refが未設定の場合rangeStartRowが0になること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        zip.folder.mockReturnValue(null);
        zip.file.mockReturnValue(null);
        mockZipLoadAsync.mockResolvedValue(zip);

        // !refなしのシート
        const sheetData = {};
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        // rangeStartRow=0のため、行番号は1から開始
        expect(result.content).toContain('[row1] A,B');
        // decode_rangeは呼ばれないこと
        expect(mockDecodeRange).not.toHaveBeenCalled();
      });

      it('描画要素がCSV範囲外の場合末尾に追記されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:A1' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        // rowIndex=100 はCSV範囲外
        mockParseShapeTexts.mockReturnValue([
          {
            text: 'OutOfRange',
            rowIndex: 100,
            metadata: { presetGeometry: 'rect' },
          },
        ]);
        mockParseConnectors.mockReturnValue([]);
        mockFormatDrawingTagFull.mockReturnValue('[s1:rect]');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        const lines = result.content.split('\n');
        // CSV範囲外の描画要素が末尾に配置されること
        const lastNonEmptyLine = lines.filter((l) => l.trim()).pop();
        expect(lastNonEmptyLine).toBe('[s1:rect] OutOfRange');
      });

      it('描画情報ありだがdrawingsByRowが空の場合、CSV行マーカーのみ出力されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:A1' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        // 画像・図形・コネクタ全て空
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        mockParseShapeTexts.mockReturnValue([]);
        mockParseConnectors.mockReturnValue([]);

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        // 描画要素がないためCSVに[rowN]マーカーが付与される
        expect(result.content).toContain('[row1] A');
      });
    });

    describe('セル内改行の[rowN]マーカー付与', () => {
      it('セル内改行を含むCSVで行ごとに正しく[rowN]マーカーが付与される', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:B2' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });

        // SheetJSのsheet_to_csvがセル内改行を含むRFC 4180形式のCSVを返す
        mockSheetToCsv.mockReturnValue(
          '通常セル,"改行\nあり"\n行2セル1,行2セル2',
        );

        zip.file.mockReturnValue(null);
        zip.folder.mockReturnValue(createMockFolder([]));

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');
        const lines = result.content.split('\n');

        // Assert
        const rowLines = lines.filter((l: string) => /^\[row\d+\] /.test(l));
        // セル内改行があっても行ごとに1つの[rowN]マーカーが付与される（2行分）
        expect(rowLines).toHaveLength(2);
        expect(rowLines[0]).toMatch(/^\[row1\]/);
        expect(rowLines[1]).toMatch(/^\[row2\]/);
      });

      it('セル内改行を含むセルがRFC 4180形式（ダブルクォート囲み）で出力される', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:B2' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });

        mockSheetToCsv.mockReturnValue(
          '通常セル,"改行\nあり"\n行2セル1,行2セル2',
        );

        zip.file.mockReturnValue(null);
        zip.folder.mockReturnValue(createMockFolder([]));

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        // 改行を含むセルがダブルクォートで囲まれていること
        expect(result.content).toContain('[row1] 通常セル,"改行\nあり"');
        // 通常セルはダブルクォートで囲まれない
        expect(result.content).toMatch(/\[row1\] 通常セル,/);
      });

      it('同一行の複数セルが全て改行を含むケース', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:C1' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });

        mockSheetToCsv.mockReturnValue(
          '"セル1行1\nセル1行2","セル2行1\nセル2行2","セル3行1\nセル3行2"',
        );

        zip.file.mockReturnValue(null);
        zip.folder.mockReturnValue(createMockFolder([]));

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        // [rowN]マーカーは1行分のみ
        const rowMarkerCount = (result.content.match(/\[row\d+\]/g) || []).length;
        expect(rowMarkerCount).toBe(1);
        // 全セルがダブルクォートで囲まれ、改行が保持されていること
        expect(result.content).toContain('"セル1行1\nセル1行2"');
        expect(result.content).toContain('"セル2行1\nセル2行2"');
        expect(result.content).toContain('"セル3行1\nセル3行2"');
      });

      it('描画情報とのインターリーブ時もセル内改行が正しく処理される', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Target="../drawings/drawing1.xml" ' +
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/>' +
            '</Relationships>',
        );
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:B2' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });

        // セル内改行を含むCSV
        mockSheetToCsv.mockReturnValue('"改行\nあり",値1\n行2,値2');

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        mockParseShapeTexts.mockReturnValue([
          {
            text: '図形テキスト',
            metadata: {
              presetGeometry: 'rect',
              position: {
                fromCol: 0,
                fromRow: 0,
                toCol: 2,
                toRow: 2,
              },
            },
          },
        ]);
        mockParseConnectors.mockReturnValue([]);
        mockFormatDrawingTagFull.mockReturnValue(
          '[s1:rect@A1-C3] 図形テキスト',
        );
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 1 } });

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');
        const lines = result.content.split('\n');

        // Assert
        // [rowN]マーカーの数をチェック（セル内改行を論理行として扱うので2つ）
        const rowLines = lines.filter((l: string) => /^\[row\d+\] /.test(l));
        expect(rowLines).toHaveLength(2);
      });
    });

    describe('AI非互換画像のフィルタリング', () => {
      it('EMF画像のみのxlsxの場合、imagesが空でimage tagが出力されないこと', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // JSZip
        const relsFileEntry = createMockZipFileEntry(
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
        );
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');
        const drawingRelsFileEntry = createMockZipFileEntry(
          '<Relationships><Relationship Id="rId1" Target="../media/image1.emf"/></Relationships>',
        );
        const emfFileEntry = createMockZipFileEntry(
          Buffer.from('EMF_DATA'),
          'nodebuffer',
        );

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/drawings/_rels/drawing1.xml.rels': drawingRelsFileEntry,
          'xl/media/image1.emf': emfFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        // XLSX
        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        // DrawingParser
        mockParseRelationships.mockImplementation((xml: string) => {
          if (xml.includes('drawing')) {
            return [
              {
                rId: 'rId1',
                target: '../drawings/drawing1.xml',
                type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
              },
            ];
          }
          return [{ rId: 'rId1', target: '../media/image1.emf' }];
        });
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([
          {
            rId: 'rId1',
            rowIndex: 0,
            cellRange: { fromCol: 0, fromRow: 0, toCol: 2, toRow: 2 },
          },
        ]);
        mockResolveImagePaths.mockReturnValue(
          new Map([['rId1', 'xl/media/image1.emf']]),
        );
        mockParseShapeTexts.mockReturnValue([]);
        mockParseConnectors.mockReturnValue([]);

        // EMF → AI非互換
        mockGetMimeFromExt.mockReturnValue('image/x-emf');
        mockIsAiSupportedImageExtension.mockReturnValue(false);

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(result.images).toEqual([]);
        expect(result.content).not.toContain('![image');
      });

      it('PNG+EMF混在の場合、PNGのみ抽出されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // JSZip
        const relsFileEntry = createMockZipFileEntry(
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
        );
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');
        const drawingRelsFileEntry = createMockZipFileEntry('<Relationships/>');
        const pngFileEntry = createMockZipFileEntry(
          Buffer.from('PNG_DATA'),
          'nodebuffer',
        );
        const emfFileEntry = createMockZipFileEntry(
          Buffer.from('EMF_DATA'),
          'nodebuffer',
        );

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/drawings/_rels/drawing1.xml.rels': drawingRelsFileEntry,
          'xl/media/image1.png': pngFileEntry,
          'xl/media/image2.emf': emfFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        // XLSX
        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });
        mockSheetToCsv.mockReturnValue('A,B,C');
        mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

        // DrawingParser
        mockParseRelationships.mockImplementation((xml: string) => {
          if (xml.includes('drawing')) {
            return [
              {
                rId: 'rId1',
                target: '../drawings/drawing1.xml',
                type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
              },
            ];
          }
          return [
            { rId: 'rId1', target: '../media/image1.png' },
            { rId: 'rId2', target: '../media/image2.emf' },
          ];
        });
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([
          {
            rId: 'rId1',
            rowIndex: 0,
            cellRange: { fromCol: 0, fromRow: 0, toCol: 2, toRow: 2 },
          },
          {
            rId: 'rId2',
            rowIndex: 1,
            cellRange: { fromCol: 3, fromRow: 0, toCol: 5, toRow: 2 },
          },
        ]);
        mockResolveImagePaths.mockReturnValue(
          new Map([
            ['rId1', 'xl/media/image1.png'],
            ['rId2', 'xl/media/image2.emf'],
          ]),
        );
        mockParseShapeTexts.mockReturnValue([]);
        mockParseConnectors.mockReturnValue([]);

        // PNG → 互換, EMF → 非互換
        mockGetMimeFromExt.mockReturnValue('image/png');
        mockIsAiSupportedImageExtension
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(false);
        mockFormatImageTag.mockReturnValue('![image at A1-C3](image_1.png)');

        // Act
        const result = await strategy.extract('/path/to/test.xlsx');

        // Assert
        expect(result.images).toHaveLength(1);
        expect(result.images[0].referenceId).toBe('image_1.png');
        expect(result.images[0].mimeType).toBe('image/png');
        expect(result.content).toContain('![image at A1-C3](image_1.png)');
      });
    });

    describe('異常系', () => {
      it('ファイル読み込みエラーはそのまま伝播すること', async () => {
        // Arrange
        const ioError = new Error('ENOENT: no such file');
        mockReadFile.mockRejectedValue(ioError);

        // Act & Assert
        await expect(
          strategy.extract('/path/to/nonexistent.xlsx'),
        ).rejects.toThrow(ioError);
      });

      it('画像解析失敗時はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        // 画像解析でエラー発生
        mockParseImages.mockImplementation(() => {
          throw new Error('画像解析エラー');
        });
        mockParseShapeTexts.mockReturnValue([]);
        mockParseConnectors.mockReturnValue([]);

        // Act & Assert
        await expect(strategy.extract('/path/to/test.xlsx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
        expect(mockLoggerWarn).toHaveBeenCalled();
      });

      it('図形解析失敗時はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const relsFileEntry = createMockZipFileEntry('<rels/>');
        const drawingFileEntry = createMockZipFileEntry('<drawing/>');

        const zipFileMap: Record<string, any> = {
          'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
          'xl/drawings/drawing1.xml': drawingFileEntry,
          'xl/workbook.xml': null,
          'xl/_rels/workbook.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
          folder: jest.fn(() =>
            createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
          ),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        const sheetData = { '!ref': 'A1:C3' };
        mockXlsxRead.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: sheetData },
        });

        mockParseRelationships.mockReturnValue([
          {
            rId: 'rId1',
            target: '../drawings/drawing1.xml',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
          },
        ]);
        mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
        mockParseImages.mockReturnValue([]);
        mockResolveImagePaths.mockReturnValue(new Map());
        // 図形解析でエラー発生
        mockParseShapeTexts.mockImplementation(() => {
          throw new Error('図形解析エラー');
        });

        // Act & Assert
        await expect(strategy.extract('/path/to/test.xlsx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
        expect(mockLoggerWarn).toHaveBeenCalled();
      });

      it('ZIP解析エラーはTextExtractorStrategyErrorでラップされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);
        mockZipLoadAsync.mockRejectedValue(new Error('Invalid ZIP'));

        // Act & Assert
        await expect(strategy.extract('/path/to/test.xlsx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
      });

      it('XLSX.readエラーはTextExtractorStrategyErrorでラップされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = createMockZip();
        mockZipLoadAsync.mockResolvedValue(zip);
        mockXlsxRead.mockImplementation(() => {
          throw new Error('Invalid XLSX');
        });

        // Act & Assert
        await expect(strategy.extract('/path/to/test.xlsx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
      });

      it('TextExtractorStrategyErrorはそのまま再スローされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-xlsx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const originalError = new TextExtractorStrategyError(
          'xlsx-sheetjs-rich',
        );
        mockZipLoadAsync.mockRejectedValue(originalError);

        // Act & Assert
        await expect(strategy.extract('/path/to/test.xlsx')).rejects.toBe(
          originalError,
        );
      });
    });
  });

  describe('Strict OOXMLネームスペース対応', () => {
    it('Strict OOXML形式のリレーションシップタイプを認識してdrawingを処理する', async () => {
      // Arrange
      const fileBuffer = Buffer.from('dummy-xlsx');
      mockReadFile.mockResolvedValue(fileBuffer);

      // Strict OOXML URIをType属性に持つrelsファイルを作成
      const strictRels =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId_drawing" Target="../drawings/drawing1.xml" ' +
        'Type="http://purl.oclc.org/ooxml/officeDocument/relationships/drawing"/>' +
        '</Relationships>';
      const relsFileEntry = createMockZipFileEntry(strictRels);
      const drawingFileEntry = createMockZipFileEntry('<drawing/>');

      const zipFileMap: Record<string, any> = {
        'xl/worksheets/_rels/sheet1.xml.rels': relsFileEntry,
        'xl/drawings/drawing1.xml': drawingFileEntry,
        'xl/workbook.xml': null,
        'xl/_rels/workbook.xml.rels': null,
      };
      const zip = {
        file: jest.fn((path: string) => zipFileMap[path] ?? null),
        folder: jest.fn(() =>
          createMockFolder([{ relativePath: 'sheet1.xml.rels', dir: false }]),
        ),
      };
      mockZipLoadAsync.mockResolvedValue(zip);

      const sheetData = { '!ref': 'A1:B2' };
      mockXlsxRead.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: sheetData },
      });
      mockSheetToCsv.mockReturnValue('テスト');
      mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

      // DrawingParser: Strict OOXML URIのリレーションシップを返す
      mockParseRelationships.mockReturnValue([
        {
          rId: 'rId_drawing',
          target: '../drawings/drawing1.xml',
          type: 'http://purl.oclc.org/ooxml/officeDocument/relationships/drawing',
        },
      ]);
      mockResolveRelativePath.mockReturnValue('xl/drawings/drawing1.xml');
      mockParseImages.mockReturnValue([]);
      mockResolveImagePaths.mockReturnValue(new Map());
      mockParseShapeTexts.mockReturnValue([
        {
          text: 'Strict形式テスト',
          metadata: {
            presetGeometry: 'rect',
            position: {
              fromCol: 0,
              fromRow: 0,
              toCol: 2,
              toRow: 2,
            },
          },
        },
      ]);
      mockParseConnectors.mockReturnValue([]);
      mockFormatDrawingTagFull.mockReturnValue(
        '[s1:rect@A1-C3] Strict形式テスト',
      );

      // Act
      const result = await strategy.extract('/path/to/test.xlsx');

      // Assert
      expect(result.content).toContain('Strict形式テスト');
    });
  });

  describe('Strict OOXML workbook.xml互換性テスト', () => {
    it('Strict OOXML workbook.xml（`<x:sheet>`要素）でシート名解決できる', async () => {
      // Arrange
      const fileBuffer = Buffer.from('dummy-xlsx');
      mockReadFile.mockResolvedValue(fileBuffer);

      // workbook.xmlを<x:sheet>プレフィックス形式にする
      const strictWorkbookXml =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheets>' +
        '<x:sheet name="売上シート" sheetId="1" r:id="rId1"/>' +
        '<x:sheet name="経費シート" sheetId="2" r:id="rId2"/>' +
        '</sheets></workbook>';
      const workbookRelsXml =
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Target="worksheets/sheet1.xml" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>' +
        '<Relationship Id="rId2" Target="worksheets/sheet2.xml" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>' +
        '</Relationships>';

      const workbookXmlEntry = createMockZipFileEntry(strictWorkbookXml);
      const workbookRelsEntry = createMockZipFileEntry(workbookRelsXml);

      const zipFileMap: Record<string, any> = {
        'xl/worksheets/_rels/sheet1.xml.rels': null,
        'xl/worksheets/_rels/sheet2.xml.rels': null,
        'xl/workbook.xml': workbookXmlEntry,
        'xl/_rels/workbook.xml.rels': workbookRelsEntry,
      };
      const zip = {
        file: jest.fn((path: string) => zipFileMap[path] ?? null),
        folder: jest.fn(() => createMockFolder([])),
      };
      mockZipLoadAsync.mockResolvedValue(zip);

      // cheerioモック: <x:sheet>要素のパース結果を返す
      let cheerioCallIndex = 0;
      const mockCheerioInstance: any = jest.fn((selector: any) => {
        if (typeof selector === 'string' && selector.includes('sheet')) {
          return {
            each: jest.fn((callback: (index: number, el: any) => void) => {
              callback(0, 'el0');
              callback(1, 'el1');
            }),
          };
        }
        // $(el)呼び出し: 各要素のattr
        const attrs: Record<string, string>[] = [
          { name: '売上シート', 'r:id': 'rId1' },
          { name: '経費シート', 'r:id': 'rId2' },
        ];
        const idx = cheerioCallIndex++;
        const attrData = attrs[idx % attrs.length];
        return {
          attr: jest.fn((key: string) => attrData[key]),
        };
      });
      mockCheerioLoad.mockReturnValue(mockCheerioInstance);

      // parseRelationships: workbook.xml.relsからのリレーション
      mockParseRelationships.mockReturnValue([
        { rId: 'rId1', target: 'worksheets/sheet1.xml' },
        { rId: 'rId2', target: 'worksheets/sheet2.xml' },
      ]);

      mockXlsxRead.mockReturnValue({
        SheetNames: ['売上シート', '経費シート'],
        Sheets: {
          売上シート: { '!ref': 'A1:A1' },
          経費シート: { '!ref': 'A1:A1' },
        },
      });
      mockSheetToCsv
        .mockReturnValueOnce('売上データ')
        .mockReturnValueOnce('経費データ');
      mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

      // Act
      const result = await strategy.extract('/path/to/test.xlsx');

      // Assert: シート名がcontent内の#sheet:マーカーに反映されていること
      expect(result.content).toContain('#sheet:売上シート');
      expect(result.content).toContain('#sheet:経費シート');
    });

    it('Office 2007形式（プレフィックスなし`<sheet>`）のシート名解決', async () => {
      // Arrange
      const fileBuffer = Buffer.from('dummy-xlsx');
      mockReadFile.mockResolvedValue(fileBuffer);

      const zip = createMockZip();
      mockZipLoadAsync.mockResolvedValue(zip);

      // workbook.xml関連ファイルなし → フォールバックでSheetNames[index]を使用
      zip.file.mockReturnValue(null);
      zip.folder.mockReturnValue(createMockFolder([]));

      mockXlsxRead.mockReturnValue({
        SheetNames: ['第1四半期', '第2四半期'],
        Sheets: {
          第1四半期: { '!ref': 'A1:A1' },
          第2四半期: { '!ref': 'A1:A1' },
        },
      });
      mockSheetToCsv
        .mockReturnValueOnce('Q1データ')
        .mockReturnValueOnce('Q2データ');
      mockDecodeRange.mockReturnValue({ s: { r: 0 }, e: { r: 0 } });

      // Act
      const result = await strategy.extract('/path/to/test.xlsx');

      // Assert: 標準形式のworkbook.xmlでシート名が正しく解決されること
      expect(result.content).toContain('#sheet:第1四半期');
      expect(result.content).toContain('#sheet:第2四半期');
    });
  });
});
