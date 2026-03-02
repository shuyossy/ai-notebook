/**
 * PptxRichExtractorStrategy のテスト
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

// PptxSlideParser クラスモック
const mockSlideParseRelationships = jest.fn();
const mockSlideParseImages = jest.fn();
const mockSlideResolveImagePaths = jest.fn();
const mockSlideParseShapeTexts = jest.fn();
const mockSlideParseConnectors = jest.fn();
const mockSlideParseTables = jest.fn();
const mockSlideEscapeCsvCell = jest.fn();

jest.mock('@/main/lib/textExtractor/PptxSlideParser', () => ({
  PptxSlideParser: jest.fn().mockImplementation(() => ({
    parseRelationships: (...args: any[]) =>
      mockSlideParseRelationships(...args),
    parseImages: (...args: any[]) => mockSlideParseImages(...args),
    resolveImagePaths: (...args: any[]) => mockSlideResolveImagePaths(...args),
    parseShapeTexts: (...args: any[]) => mockSlideParseShapeTexts(...args),
    parseConnectors: (...args: any[]) => mockSlideParseConnectors(...args),
    parseTables: (...args: any[]) => mockSlideParseTables(...args),
    escapeCsvCell: (...args: any[]) => mockSlideEscapeCsvCell(...args),
  })),
}));

// XlsxDrawingParser ユーティリティ関数モック
const mockFormatImageTag = jest.fn();
const mockFormatDrawingTagFull = jest.fn();
const mockFormatDrawingTagShort = jest.fn();
const mockGetArrowSymbol = jest.fn();

jest.mock('@/main/lib/textExtractor/XlsxDrawingParser', () => ({
  formatImageTag: (...args: any[]) => mockFormatImageTag(...args),
  formatDrawingTagFull: (...args: any[]) => mockFormatDrawingTagFull(...args),
  formatDrawingTagShort: (...args: any[]) => mockFormatDrawingTagShort(...args),
  getArrowSymbol: (...args: any[]) => mockGetArrowSymbol(...args),
}));

// mimeUtils モック
const mockGetMimeFromExt = jest.fn();
const mockIsAiCompatibleMime = jest.fn();
jest.mock('@/main/lib/textExtractor/mimeUtils', () => ({
  getMimeFromExt: (...args: any[]) => mockGetMimeFromExt(...args),
  isAiCompatibleMime: (...args: any[]) => mockIsAiCompatibleMime(...args),
}));

// JSZip モック
const mockZipLoadAsync = jest.fn();
jest.mock('jszip', () => ({
  __esModule: true,
  default: {
    loadAsync: (...args: any[]) => mockZipLoadAsync(...args),
  },
}));

// cheerio モック（getSlideOrder内で利用）
const mockCheerioLoad = jest.fn();
jest.mock('cheerio', () => ({
  load: (...args: any[]) => mockCheerioLoad(...args),
}));

// ---------- テスト対象のインポート ----------
import { PptxRichExtractorStrategy } from '@/main/lib/textExtractor/strategies/PptxRichExtractorStrategy';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';

// ---------- ヘルパー ----------

/** ZIP内のasyncを返すファイルオブジェクトのヘルパー */
function createMockZipFileEntry(content: string | Buffer) {
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

/**
 * cheerio.load モックのヘルパー
 * presentation.xmlからsldIdを抽出するためのモック$を生成
 */
function setupCheerioForSlideOrder(slideRIds: string[]) {
  const mockElements = slideRIds.map((rId) => ({
    attribs: { 'r:id': rId },
  }));

  const mockJQuery: any = jest.fn((selectorOrEl: any) => {
    if (typeof selectorOrEl === 'string') {
      if (selectorOrEl.includes('sldIdLst') || selectorOrEl.includes('sldId')) {
        return {
          each: (cb: (index: number, el: any) => void) => {
            mockElements.forEach((el, i) => cb(i, el));
          },
        };
      }
      return { each: jest.fn() };
    }
    // 要素オブジェクトの場合
    return {
      attr: (name: string) => selectorOrEl?.attribs?.[name],
    };
  });

  mockCheerioLoad.mockReturnValue(mockJQuery);
}

/**
 * 基本的なZIPオブジェクト構成を生成するヘルパー
 * スライド1枚の最小構成
 */
function createBasicPptxZip(overrides?: {
  slideXml?: string;
  slideRelsXml?: string;
  hasSlideRels?: boolean;
  imageBuffer?: Buffer;
  imagePath?: string;
  extraFiles?: Record<string, any>;
}) {
  const presentationFile = createMockZipFileEntry('<presentation/>');
  const presentationRelsFile = createMockZipFileEntry('<Relationships/>');
  const slideFile = createMockZipFileEntry(overrides?.slideXml ?? '<slide/>');
  const slideRelsFile =
    overrides?.hasSlideRels !== false
      ? createMockZipFileEntry(overrides?.slideRelsXml ?? '<Relationships/>')
      : null;

  const extraFiles = overrides?.extraFiles ?? {};

  const zipFileMap: Record<string, any> = {
    'ppt/presentation.xml': presentationFile,
    'ppt/_rels/presentation.xml.rels': presentationRelsFile,
    'ppt/slides/slide1.xml': slideFile,
    'ppt/slides/_rels/slide1.xml.rels': slideRelsFile,
    ...extraFiles,
  };

  if (overrides?.imagePath && overrides?.imageBuffer) {
    const imgEntry = createMockZipFileEntry(overrides.imageBuffer);
    zipFileMap[overrides.imagePath] = imgEntry;
  }

  return {
    file: jest.fn((path: string) => zipFileMap[path] ?? null),
  };
}

// ---------- テスト ----------

describe('PptxRichExtractorStrategy', () => {
  let strategy: PptxRichExtractorStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new PptxRichExtractorStrategy();

    // デフォルトのモック設定
    mockGetMimeFromExt.mockReturnValue('image/png');
    mockIsAiCompatibleMime.mockReturnValue(true);
    mockFormatImageTag.mockImplementation(
      (refId: string) => `![image](${refId})`,
    );
    mockFormatDrawingTagFull.mockImplementation((id: string) => `[${id}]`);
    mockFormatDrawingTagShort.mockImplementation((id: string) => `[${id}]`);
    mockGetArrowSymbol.mockReturnValue('->');
    mockSlideEscapeCsvCell.mockImplementation((val: string) => val);
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.pptxであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.pptx']);
    });

    it('戦略タイプがpptx-richであること', () => {
      expect(strategy.getStrategyType()).toBe('pptx-rich');
    });

    it('フォーマットタイプがpptx-rich-v1であること', () => {
      expect(strategy.getFormatType()).toBe('pptx-rich-v1');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('テキストのみのスライド抽出が成功すること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // cheerioセットアップ：slide1のみ
        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        // スライド解析：テキストのみ
        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([
          {
            text: 'Title Text',
            rowIndex: 0,
            isTextBox: true,
          },
        ]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('#slide:1');
        expect(result.content).toContain('Title Text');
        expect(result.images).toEqual([]);
        expect(mockReadFile).toHaveBeenCalledWith('/path/to/test.pptx');
      });

      it('画像付きスライドの抽出が成功すること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockImplementation((xml: string) => {
          // presentation.xml.rels
          if (!xml.includes('slide')) {
            return [{ rId: 'rId2', target: 'slides/slide1.xml' }];
          }
          // slide rels
          return [{ rId: 'rId1', target: '../media/image1.png' }];
        });

        const imageBuffer = Buffer.from('PNG_DATA');
        const zip = createBasicPptxZip({
          imageBuffer,
          imagePath: 'ppt/media/image1.png',
        });
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([{ rId: 'rId1' }]);
        mockSlideResolveImagePaths.mockReturnValue(
          new Map([['rId1', 'ppt/media/image1.png']]),
        );
        mockSlideParseShapeTexts.mockReturnValue([]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        mockFormatImageTag.mockReturnValue('![image](image_1.png)');

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('#slide:1');
        expect(result.content).toContain('![image](image_1.png)');
        expect(result.images).toHaveLength(1);
        expect(result.images[0].referenceId).toBe('image_1.png');
        expect(result.images[0].mimeType).toBe('image/png');
        expect(result.images[0].base64Data).toContain('data:image/png;base64,');
      });

      it('テーブル付きスライドの抽出が成功すること（CSV形式）', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([
          {
            rows: [
              ['Header1', 'Header2'],
              ['Data1', 'Data2'],
            ],
          },
        ]);
        mockSlideEscapeCsvCell.mockImplementation((val: string) => val);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('#slide:1');
        expect(result.content).toContain('Header1,Header2');
        expect(result.content).toContain('Data1,Data2');
        expect(result.images).toEqual([]);
      });

      it('テキストボックスはプレフィックスなしで出力されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([
          {
            text: 'Plain Text Box',
            rowIndex: 0,
            isTextBox: true,
          },
          {
            text: 'Placeholder Text',
            rowIndex: 0,
            isTextBox: true,
          },
        ]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('Plain Text Box');
        expect(result.content).toContain('Placeholder Text');
        // sNプレフィックスが含まれないこと
        expect(result.content).not.toContain('[s');
        // formatDrawingTagFullはテキストボックスには呼ばれないこと
        expect(mockFormatDrawingTagFull).not.toHaveBeenCalled();
      });

      it('図形はsNプレフィックス付きで出力されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([
          {
            text: 'Shape Content',
            rowIndex: 0,
            metadata: { presetGeometry: 'rect' },
            drawingObjectId: 5,
            // isTextBoxが未設定（=falsy）→図形扱い
          },
        ]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);
        mockFormatDrawingTagFull.mockReturnValue('[s1:rect]');

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('[s1:rect] Shape Content');
        expect(mockFormatDrawingTagFull).toHaveBeenCalledWith('s1', {
          presetGeometry: 'rect',
        });
      });

      it('複数行の図形テキストが正しくフォーマットされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([
          {
            text: 'Line1\nLine2\nLine3',
            rowIndex: 0,
            metadata: { presetGeometry: 'ellipse' },
          },
        ]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);
        mockFormatDrawingTagFull.mockReturnValue('[s1:ellipse]');
        mockFormatDrawingTagShort.mockReturnValue('[s1]');

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('[s1:ellipse] Line1');
        expect(result.content).toContain('[s1] Line2');
        expect(result.content).toContain('[s1] Line3');
      });

      it('コネクタはcNプレフィックス付きで出力されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        // 2つの図形を登録してdrawingObjectIdマッピングを構築
        mockSlideParseShapeTexts.mockReturnValue([
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
        mockSlideParseConnectors.mockReturnValue([
          {
            rowIndex: 0,
            metadata: { presetGeometry: 'straightConnector1' },
            startConnection: {
              drawingObjectId: 10,
              connectionSiteIndex: 0,
            },
            endConnection: {
              drawingObjectId: 20,
              connectionSiteIndex: 0,
            },
            headEndType: 'none',
            tailEndType: 'triangle',
          },
        ]);
        mockSlideParseTables.mockReturnValue([]);
        mockGetArrowSymbol.mockReturnValue('->');
        mockFormatDrawingTagFull.mockImplementation(
          (id: string, _meta?: any, connPart?: string) =>
            connPart ? `[${id} ${connPart}]` : `[${id}]`,
        );

        // Act
        await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(mockGetArrowSymbol).toHaveBeenCalledWith('none', 'triangle');
        // s1, s2は図形、c3がコネクタ
        expect(mockFormatDrawingTagFull).toHaveBeenCalledWith(
          'c3',
          { presetGeometry: 'straightConnector1' },
          's1->s2',
        );
      });

      it('複数スライドの順序が正しく維持されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // スライド2→スライド1の順序
        setupCheerioForSlideOrder(['rId3', 'rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
          { rId: 'rId3', target: 'slides/slide2.xml' },
        ]);

        const slide1File = createMockZipFileEntry('<slide1/>');
        const slide2File = createMockZipFileEntry('<slide2/>');
        const presentationFile = createMockZipFileEntry('<presentation/>');
        const presentationRelsFile = createMockZipFileEntry('<Relationships/>');

        const zipFileMap: Record<string, any> = {
          'ppt/presentation.xml': presentationFile,
          'ppt/_rels/presentation.xml.rels': presentationRelsFile,
          'ppt/slides/slide1.xml': slide1File,
          'ppt/slides/slide2.xml': slide2File,
          'ppt/slides/_rels/slide1.xml.rels': null,
          'ppt/slides/_rels/slide2.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([
          { text: 'Text', rowIndex: 0, isTextBox: true },
        ]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        const lines = result.content.split('\n');
        const slide2Index = lines.findIndex((l) => l.includes('#slide:2'));
        const slide1Index = lines.findIndex((l) => l.includes('#slide:1'));
        // スライド2がスライド1より先に出力される
        expect(slide2Index).toBeLessThan(slide1Index);
      });

      it('スライドリレーションXMLが存在しない場合も処理が継続されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip({ hasSlideRels: false });
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([
          { text: 'No Rels', rowIndex: 0, isTextBox: true },
        ]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('#slide:1');
        expect(result.content).toContain('No Rels');
      });

      it('テーブルの末尾空行が除去されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([]);
        mockSlideParseConnectors.mockReturnValue([]);
        // 2つのテーブル（テーブル間に空行が挟まるが、末尾の空行は除去される）
        mockSlideParseTables.mockReturnValue([
          { rows: [['A', 'B']] },
          { rows: [['C', 'D']] },
        ]);
        mockSlideEscapeCsvCell.mockImplementation((val: string) => val);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        // テーブル間に空行はあるが末尾には空行がない
        expect(result.content).toContain('A,B');
        expect(result.content).toContain('C,D');
        // 末尾が空行で終わらないこと
        expect(result.content.trimEnd()).toBe(result.content);
      });
    });

    describe('AI非互換画像のフィルタリング', () => {
      it('WMF画像のみのpptxの場合、imagesが空でimage tagが出力されないこと', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockImplementation((xml: string) => {
          if (!xml.includes('slide')) {
            return [{ rId: 'rId2', target: 'slides/slide1.xml' }];
          }
          return [{ rId: 'rId1', target: '../media/image1.wmf' }];
        });

        const wmfBuffer = Buffer.from('WMF_DATA');
        const zip = createBasicPptxZip({
          imageBuffer: wmfBuffer,
          imagePath: 'ppt/media/image1.wmf',
        });
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([{ rId: 'rId1' }]);
        mockSlideResolveImagePaths.mockReturnValue(
          new Map([['rId1', 'ppt/media/image1.wmf']]),
        );
        mockSlideParseShapeTexts.mockReturnValue([]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // WMF → AI非互換
        mockGetMimeFromExt.mockReturnValue('image/x-wmf');
        mockIsAiCompatibleMime.mockReturnValue(false);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.images).toEqual([]);
        expect(result.content).not.toContain('![image');
      });

      it('PNG+WMF混在の場合、PNGのみ抽出されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockImplementation((xml: string) => {
          if (!xml.includes('slide')) {
            return [{ rId: 'rId2', target: 'slides/slide1.xml' }];
          }
          return [
            { rId: 'rId1', target: '../media/image1.png' },
            { rId: 'rId2', target: '../media/image2.wmf' },
          ];
        });

        const pngBuffer = Buffer.from('PNG_DATA');
        const wmfBuffer = Buffer.from('WMF_DATA');

        const pngEntry = {
          async: jest.fn((t: string) => {
            if (t === 'nodebuffer') return Promise.resolve(pngBuffer);
            return Promise.resolve(pngBuffer.toString());
          }),
          dir: false,
        };
        const wmfEntry = {
          async: jest.fn((t: string) => {
            if (t === 'nodebuffer') return Promise.resolve(wmfBuffer);
            return Promise.resolve(wmfBuffer.toString());
          }),
          dir: false,
        };

        const zip = createBasicPptxZip({
          extraFiles: {
            'ppt/media/image1.png': pngEntry,
            'ppt/media/image2.wmf': wmfEntry,
          },
        });
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([
          { rId: 'rId1' },
          { rId: 'rId2' },
        ]);
        mockSlideResolveImagePaths.mockReturnValue(
          new Map([
            ['rId1', 'ppt/media/image1.png'],
            ['rId2', 'ppt/media/image2.wmf'],
          ]),
        );
        mockSlideParseShapeTexts.mockReturnValue([]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // PNG → 互換, WMF → 非互換
        mockGetMimeFromExt
          .mockReturnValueOnce('image/png')
          .mockReturnValueOnce('image/x-wmf');
        mockIsAiCompatibleMime
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(false);
        mockFormatImageTag.mockReturnValue('![image](image_1.png)');

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.images).toHaveLength(1);
        expect(result.images[0].referenceId).toBe('image_1.png');
        expect(result.images[0].mimeType).toBe('image/png');
        expect(result.content).toContain('![image](image_1.png)');
      });
    });

    describe('異常系', () => {
      it('ファイル読み込みエラーはそのまま伝播すること', async () => {
        // Arrange
        const ioError = new Error('ENOENT: no such file');
        mockReadFile.mockRejectedValue(ioError);

        // Act & Assert
        await expect(
          strategy.extract('/path/to/nonexistent.pptx'),
        ).rejects.toThrow(ioError);
      });

      it('スライドが0個の場合はTextExtractorStrategyErrorをスローすること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // cheerio: スライドID空
        setupCheerioForSlideOrder([]);
        mockSlideParseRelationships.mockReturnValue([]);

        const presentationFile = createMockZipFileEntry('<presentation/>');
        const presentationRelsFile = createMockZipFileEntry('<Relationships/>');
        const zip = {
          file: jest.fn((path: string) => {
            if (path === 'ppt/presentation.xml') return presentationFile;
            if (path === 'ppt/_rels/presentation.xml.rels')
              return presentationRelsFile;
            return null;
          }),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        // Act & Assert
        await expect(strategy.extract('/path/to/test.pptx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
      });

      it('presentation.xmlが存在しない場合はTextExtractorStrategyErrorをスローすること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const zip = {
          file: jest.fn(() => null),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        // Act & Assert
        await expect(strategy.extract('/path/to/test.pptx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
      });

      it('画像解析失敗時はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        // 画像解析でエラー
        mockSlideParseImages.mockImplementation(() => {
          throw new Error('画像解析エラー');
        });
        mockSlideParseShapeTexts.mockReturnValue([]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // Act & Assert
        await expect(strategy.extract('/path/to/test.pptx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
        expect(mockLoggerWarn).toHaveBeenCalled();
      });

      it('図形解析失敗時はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        // 図形解析でエラー
        mockSlideParseShapeTexts.mockImplementation(() => {
          throw new Error('図形解析エラー');
        });
        mockSlideParseTables.mockReturnValue([]);

        // Act & Assert
        await expect(strategy.extract('/path/to/test.pptx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
        expect(mockLoggerWarn).toHaveBeenCalled();
      });

      it('テーブル解析失敗時はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
        ]);

        const zip = createBasicPptxZip();
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([]);
        mockSlideParseConnectors.mockReturnValue([]);
        // テーブル解析でエラー
        mockSlideParseTables.mockImplementation(() => {
          throw new Error('テーブル解析エラー');
        });

        // Act & Assert
        await expect(strategy.extract('/path/to/test.pptx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
        expect(mockLoggerWarn).toHaveBeenCalled();
      });

      it('ZIP解析エラーはTextExtractorStrategyErrorでラップされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);
        mockZipLoadAsync.mockRejectedValue(new Error('Invalid ZIP'));

        // Act & Assert
        await expect(strategy.extract('/path/to/test.pptx')).rejects.toThrow(
          TextExtractorStrategyError,
        );
      });

      it('TextExtractorStrategyErrorはそのまま再スローされること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        const originalError = new TextExtractorStrategyError('pptx-rich');
        mockZipLoadAsync.mockRejectedValue(originalError);

        // Act & Assert
        await expect(strategy.extract('/path/to/test.pptx')).rejects.toBe(
          originalError,
        );
      });
    });

    describe('Strict OOXML形式対応', () => {
      it('名前空間プレフィックスなしのpresentation.xmlでスライド順序が正しく取得されること', async () => {
        // Arrange: Strict OOXML形式ではp:プレフィックスなしで<sldIdLst><sldId>が記述される
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        // cheerioセットアップ：プレフィックスなしセレクタ（sldIdLst > sldId）でマッチ
        setupCheerioForSlideOrder(['rId10', 'rId11']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId10', target: 'slides/slide2.xml' },
          { rId: 'rId11', target: 'slides/slide1.xml' },
        ]);

        const slide1File = createMockZipFileEntry('<slide1/>');
        const slide2File = createMockZipFileEntry('<slide2/>');
        const presentationFile = createMockZipFileEntry('<presentation/>');
        const presentationRelsFile = createMockZipFileEntry('<Relationships/>');

        const zipFileMap: Record<string, any> = {
          'ppt/presentation.xml': presentationFile,
          'ppt/_rels/presentation.xml.rels': presentationRelsFile,
          'ppt/slides/slide1.xml': slide1File,
          'ppt/slides/slide2.xml': slide2File,
          'ppt/slides/_rels/slide1.xml.rels': null,
          'ppt/slides/_rels/slide2.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockReturnValue([
          { text: 'Slide Text', rowIndex: 0, isTextBox: true },
        ]);
        mockSlideParseConnectors.mockReturnValue([]);
        mockSlideParseTables.mockReturnValue([]);

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        const lines = result.content.split('\n');
        const slide2Index = lines.findIndex((l) => l.includes('#slide:2'));
        const slide1Index = lines.findIndex((l) => l.includes('#slide:1'));
        // presentation.xmlの順序に従いスライド2→スライド1の順
        expect(slide2Index).toBeLessThan(slide1Index);
        expect(result.content).toContain('Slide Text');
      });

      it('混在描画要素（画像・テキスト・テーブル）が複数スライドで正しく抽出されること', async () => {
        // Arrange
        const fileBuffer = Buffer.from('dummy-pptx');
        mockReadFile.mockResolvedValue(fileBuffer);

        setupCheerioForSlideOrder(['rId2', 'rId3']);
        mockSlideParseRelationships.mockReturnValue([
          { rId: 'rId2', target: 'slides/slide1.xml' },
          { rId: 'rId3', target: 'slides/slide2.xml' },
        ]);

        const slide1File = createMockZipFileEntry('<slide1/>');
        const slide2File = createMockZipFileEntry('<slide2/>');
        const presentationFile = createMockZipFileEntry('<presentation/>');
        const presentationRelsFile = createMockZipFileEntry('<Relationships/>');

        const zipFileMap: Record<string, any> = {
          'ppt/presentation.xml': presentationFile,
          'ppt/_rels/presentation.xml.rels': presentationRelsFile,
          'ppt/slides/slide1.xml': slide1File,
          'ppt/slides/slide2.xml': slide2File,
          'ppt/slides/_rels/slide1.xml.rels': null,
          'ppt/slides/_rels/slide2.xml.rels': null,
        };
        const zip = {
          file: jest.fn((path: string) => zipFileMap[path] ?? null),
        };
        mockZipLoadAsync.mockResolvedValue(zip);

        // スライド1: テキストボックスと図形
        // スライド2: テーブル
        let callCount = 0;
        mockSlideParseImages.mockReturnValue([]);
        mockSlideResolveImagePaths.mockReturnValue(new Map());
        mockSlideParseShapeTexts.mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return [
              { text: 'Title', rowIndex: 0, isTextBox: true },
              {
                text: 'Shape Content',
                rowIndex: 0,
                metadata: { presetGeometry: 'rect' },
              },
            ];
          }
          return [];
        });
        mockSlideParseConnectors.mockReturnValue([]);

        let tableCallCount = 0;
        mockSlideParseTables.mockImplementation(() => {
          tableCallCount++;
          if (tableCallCount === 2) {
            return [
              {
                rows: [
                  ['A', 'B'],
                  ['C', 'D'],
                ],
              },
            ];
          }
          return [];
        });
        mockSlideEscapeCsvCell.mockImplementation((val: string) => val);
        mockFormatDrawingTagFull.mockReturnValue('[s1:rect]');

        // Act
        const result = await strategy.extract('/path/to/test.pptx');

        // Assert
        expect(result.content).toContain('#slide:1');
        expect(result.content).toContain('#slide:2');
        expect(result.content).toContain('Title');
        expect(result.content).toContain('[s1:rect] Shape Content');
        expect(result.content).toContain('A,B');
        expect(result.content).toContain('C,D');
      });
    });
  });
});
