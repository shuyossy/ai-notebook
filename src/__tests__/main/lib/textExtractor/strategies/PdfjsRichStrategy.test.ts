/**
 * PdfjsRichStrategy のテスト
 * @jest-environment node
 */

// fs のモック
const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
}));

// pdfjs-dist のモック
const mockGetDocument = jest.fn();
const mockOPS = {
  save: 10,
  restore: 11,
  transform: 12,
  paintImageXObject: 85,
  paintFormXObjectBegin: 86,
  paintFormXObjectEnd: 87,
};
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (...args: any[]) => mockGetDocument(...args),
  OPS: mockOPS,
}));

// @napi-rs/canvas のモック
const mockEncodeSync = jest.fn<any, any[]>();
const mockPutImageData = jest.fn<any, any[]>();
const mockGetContext = jest.fn<any, any[]>().mockReturnValue({
  putImageData: (...args: any[]) => mockPutImageData(...args),
});
const mockCreateCanvas = jest.fn<any, any[]>().mockReturnValue({
  getContext: (...args: any[]) => mockGetContext(...args),
  encodeSync: (...args: any[]) => mockEncodeSync(...args),
});
jest.mock('@napi-rs/canvas', () => ({
  createCanvas: (...args: any[]) => mockCreateCanvas(...args),
  ImageData: class MockImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  },
}));

// XlsxDrawingParser のモック
const mockFormatImageTag = jest.fn();
jest.mock('@/main/lib/textExtractor/XlsxDrawingParser', () => ({
  formatImageTag: (...args: any[]) => mockFormatImageTag(...args),
}));

// logger のモック
const mockWarn = jest.fn();
jest.mock('@/main/lib/logger', () => ({
  getMainLogger: () => ({
    warn: (...args: any[]) => mockWarn(...args),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { PdfjsRichStrategy } from '@/main/lib/textExtractor/strategies/PdfjsRichStrategy';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';

/**
 * テスト用のページモックを生成するヘルパー
 */
function createMockPage(options: {
  viewportHeight?: number;
  textItems?: any[];
  operatorList?: { fnArray: number[]; argsArray: any[][] };
  getOperatorListError?: Error;
  objs?: Record<string, any>;
  commonObjs?: Record<string, any>;
}) {
  const {
    viewportHeight = 800,
    textItems = [],
    operatorList = { fnArray: [], argsArray: [] },
    getOperatorListError,
    objs = {},
    commonObjs = {},
  } = options;

  return {
    getViewport: jest.fn(() => ({ height: viewportHeight })),
    getTextContent: jest.fn(async () => ({
      items: textItems,
    })),
    getOperatorList: getOperatorListError
      ? jest.fn(async () => {
          throw getOperatorListError;
        })
      : jest.fn(async () => operatorList),
    objs: {
      get: (key: string, resolve: (val: any) => void) => {
        resolve(objs[key] ?? null);
      },
    },
    commonObjs: {
      get: (key: string, resolve: (val: any) => void) => {
        resolve(commonObjs[key] ?? null);
      },
    },
  };
}

/**
 * テスト用のpdfドキュメントモックを生成するヘルパー
 */
function createMockPdfDocument(pages: ReturnType<typeof createMockPage>[]) {
  const pdfDoc = {
    numPages: pages.length,
    getPage: jest.fn(async (pageNum: number) => pages[pageNum - 1]),
  };
  mockGetDocument.mockReturnValue({
    promise: Promise.resolve(pdfDoc),
  });
  return pdfDoc;
}

describe('PdfjsRichStrategy', () => {
  let strategy: PdfjsRichStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new PdfjsRichStrategy();

    // デフォルトのモック動作
    mockFormatImageTag.mockImplementation(
      (refId: string) => `![image](${refId})`,
    );
    mockEncodeSync.mockReturnValue(Buffer.from('fake-png-data'));
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.pdfであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.pdf']);
    });

    it('戦略タイプがpdfjs-richであること', () => {
      expect(strategy.getStrategyType()).toBe('pdfjs-rich');
    });

    it('フォーマットタイプがpdf-rich-v1であること', () => {
      expect(strategy.getFormatType()).toBe('pdf-rich-v1');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('テキストのみのPDF抽出が成功すること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const page = createMockPage({
          viewportHeight: 800,
          textItems: [
            { str: 'Hello ', transform: [1, 0, 0, 1, 50, 750] },
            { str: 'World', transform: [1, 0, 0, 1, 100, 750] },
            { str: '次の行', transform: [1, 0, 0, 1, 50, 700] },
          ],
        });
        createMockPdfDocument([page]);

        // Act
        const result = await strategy.extract('/path/to/doc.pdf');

        // Assert
        expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/doc.pdf');
        expect(result.content).toContain('#page:1');
        expect(result.content).toContain('Hello World');
        expect(result.content).toContain('次の行');
        expect(result.images).toEqual([]);
      });

      it('テキストと画像のインターリーブが正しいこと', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const imageData = new Uint8ClampedArray(100 * 50 * 3); // 100x50 RGB
        const page = createMockPage({
          viewportHeight: 800,
          textItems: [
            // 上部のテキスト（Y=750 → yTopDown=50）
            { str: '上部テキスト', transform: [1, 0, 0, 1, 50, 750] },
            // 下部のテキスト（Y=400 → yTopDown=400）
            { str: '下部テキスト', transform: [1, 0, 0, 1, 50, 400] },
          ],
          operatorList: {
            fnArray: [
              mockOPS.save,
              mockOPS.transform,
              mockOPS.paintImageXObject,
              mockOPS.restore,
            ],
            argsArray: [
              [],
              [1, 0, 0, 50, 0, 550], // transform: yPdf=550, height=50 → yTopDown=800-550-50=200
              ['img_1'],
              [],
            ],
          },
          objs: {
            img_1: {
              data: imageData,
              width: 100,
              height: 50,
            },
          },
        });
        createMockPdfDocument([page]);

        const pngBuffer = Buffer.from('png-image-data');
        mockEncodeSync.mockReturnValue(pngBuffer);

        // Act
        const result = await strategy.extract('/path/to/doc_with_image.pdf');

        // Assert
        // インターリーブ順: 上部テキスト(yTopDown=50) → 画像(yTopDown=200) → 下部テキスト(yTopDown=400)
        const lines = result.content.split('\n');
        const contentLines = lines.filter((l) => l && l !== '#page:1');
        expect(contentLines[0]).toBe('上部テキスト');
        expect(contentLines[1]).toBe('![image](image_1.png)');
        expect(contentLines[2]).toBe('下部テキスト');

        // 画像データの検証
        expect(result.images).toHaveLength(1);
        expect(result.images[0].referenceId).toBe('image_1.png');
        expect(result.images[0].mimeType).toBe('image/png');
        expect(result.images[0].base64Data).toBe(
          `data:image/png;base64,${pngBuffer.toString('base64')}`,
        );

        // @napi-rs/canvasが正しいパラメータで呼ばれていること
        expect(mockCreateCanvas).toHaveBeenCalledWith(100, 50);
      });

      it('複数ページの処理が成功すること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const page1 = createMockPage({
          viewportHeight: 800,
          textItems: [
            { str: 'ページ1の内容', transform: [1, 0, 0, 1, 50, 750] },
          ],
        });
        const page2 = createMockPage({
          viewportHeight: 800,
          textItems: [
            { str: 'ページ2の内容', transform: [1, 0, 0, 1, 50, 750] },
          ],
        });
        createMockPdfDocument([page1, page2]);

        // Act
        const result = await strategy.extract('/path/to/multi_page.pdf');

        // Assert
        expect(result.content).toContain('#page:1');
        expect(result.content).toContain('ページ1の内容');
        expect(result.content).toContain('#page:2');
        expect(result.content).toContain('ページ2の内容');
        expect(result.images).toEqual([]);
      });

      it('g_プレフィックス付きの画像キーはcommonObjsから取得されること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const imageData = new Uint8ClampedArray(10 * 10 * 4); // 10x10 RGBA
        const page = createMockPage({
          viewportHeight: 800,
          textItems: [],
          operatorList: {
            fnArray: [mockOPS.paintImageXObject],
            argsArray: [['g_shared_img']],
          },
          commonObjs: {
            g_shared_img: {
              data: imageData,
              width: 10,
              height: 10,
            },
          },
        });
        createMockPdfDocument([page]);

        // Act
        const result = await strategy.extract('/path/to/doc.pdf');

        // Assert
        expect(result.images).toHaveLength(1);
        expect(result.images[0].referenceId).toBe('image_1.png');
      });

      it('無効な画像データ（null/不正チャネル数）はスキップされること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        // 不正なチャネル数の画像（5チャネル）
        const badImageData = new Uint8ClampedArray(10 * 10 * 5);
        const page = createMockPage({
          viewportHeight: 800,
          textItems: [{ str: 'テキスト', transform: [1, 0, 0, 1, 50, 750] }],
          operatorList: {
            fnArray: [mockOPS.paintImageXObject, mockOPS.paintImageXObject],
            argsArray: [
              ['null_img'], // nullが返る画像
              ['bad_channels'], // 不正チャネル数の画像
            ],
          },
          objs: {
            null_img: null,
            bad_channels: {
              data: badImageData,
              width: 10,
              height: 10,
            },
          },
        });
        createMockPdfDocument([page]);

        // Act
        const result = await strategy.extract('/path/to/doc.pdf');

        // Assert
        expect(result.images).toEqual([]);
        expect(result.content).toContain('テキスト');
      });
    });

    describe('異常系', () => {
      it('ファイル読み込みエラーはそのまま伝播すること', async () => {
        // Arrange
        const ioError = new Error('ENOENT: no such file or directory');
        mockReadFileSync.mockImplementation(() => {
          throw ioError;
        });

        // Act & Assert
        await expect(strategy.extract('/path/to/missing.pdf')).rejects.toThrow(
          ioError,
        );
        // TextExtractorStrategyErrorにラップされないことを確認
        await expect(
          strategy.extract('/path/to/missing.pdf'),
        ).rejects.not.toBeInstanceOf(TextExtractorStrategyError);
      });

      it('ページが0のPDFはTextExtractorStrategyErrorをスローすること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        // ページ数0のPDF
        createMockPdfDocument([]);

        // Act & Assert
        await expect(strategy.extract('/path/to/empty.pdf')).rejects.toThrow(
          TextExtractorStrategyError,
        );

        try {
          await strategy.extract('/path/to/empty.pdf');
        } catch (error) {
          expect(error).toBeInstanceOf(TextExtractorStrategyError);
          expect((error as TextExtractorStrategyError).strategyType).toBe(
            'pdfjs-rich',
          );
        }
      });

      it('OperatorList取得失敗時はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const page = createMockPage({
          viewportHeight: 800,
          textItems: [{ str: 'テキスト', transform: [1, 0, 0, 1, 50, 750] }],
          getOperatorListError: new Error('OperatorList parse error'),
        });
        createMockPdfDocument([page]);

        // Act & Assert
        // anyImagesFailed=trueとなり、最後にTextExtractorStrategyErrorがスローされる
        await expect(strategy.extract('/path/to/doc.pdf')).rejects.toThrow(
          TextExtractorStrategyError,
        );

        // 警告ログが出力されていること
        expect(mockWarn).toHaveBeenCalledWith(
          expect.stringContaining('画像解析に失敗しました'),
        );
      });

      it('PNG変換が部分的に失敗した場合は成功した画像のみ含めて結果を返すこと', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const imageData1 = new Uint8ClampedArray(10 * 10 * 3);
        const imageData2 = new Uint8ClampedArray(10 * 10 * 3);
        const page = createMockPage({
          viewportHeight: 800,
          textItems: [{ str: 'テキスト', transform: [1, 0, 0, 1, 50, 750] }],
          operatorList: {
            fnArray: [mockOPS.paintImageXObject, mockOPS.paintImageXObject],
            argsArray: [['img_1'], ['img_2']],
          },
          objs: {
            img_1: { data: imageData1, width: 10, height: 10 },
            img_2: { data: imageData2, width: 10, height: 10 },
          },
        });
        createMockPdfDocument([page]);

        // 1つ目の画像はcanvas変換失敗、2つ目は成功
        const pngBuffer = Buffer.from('png-data');
        mockEncodeSync
          .mockImplementationOnce(() => {
            throw new Error('canvas conversion failed');
          })
          .mockReturnValueOnce(pngBuffer);

        // Act
        const result = await strategy.extract('/path/to/doc.pdf');

        // Assert
        // フォールバックせず結果を返すこと
        expect(result.images).toHaveLength(1);
        expect(result.images[0].referenceId).toBe('image_2.png');
        // 警告ログが出力されていること
        expect(mockWarn).toHaveBeenCalledWith(
          expect.stringContaining('PNG変換に失敗しました'),
        );
      });

      it('全画像のPNG変換が失敗した場合はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const imageData1 = new Uint8ClampedArray(10 * 10 * 3);
        const imageData2 = new Uint8ClampedArray(10 * 10 * 3);
        const page = createMockPage({
          viewportHeight: 800,
          textItems: [{ str: 'テキスト', transform: [1, 0, 0, 1, 50, 750] }],
          operatorList: {
            fnArray: [mockOPS.paintImageXObject, mockOPS.paintImageXObject],
            argsArray: [['img_1'], ['img_2']],
          },
          objs: {
            img_1: { data: imageData1, width: 10, height: 10 },
            img_2: { data: imageData2, width: 10, height: 10 },
          },
        });
        createMockPdfDocument([page]);

        // 全てのcanvas変換を失敗させる
        mockEncodeSync
          .mockImplementationOnce(() => {
            throw new Error('canvas conversion failed');
          })
          .mockImplementationOnce(() => {
            throw new Error('canvas conversion failed');
          });

        // Act & Assert
        await expect(strategy.extract('/path/to/doc.pdf')).rejects.toThrow(
          TextExtractorStrategyError,
        );

        // 警告ログが出力されていること
        expect(mockWarn).toHaveBeenCalledWith(
          expect.stringContaining(
            '全ての画像のPNG変換に失敗したためフォールバックします',
          ),
        );
      });

      it('画像1つでPNG変換失敗した場合はTextExtractorStrategyErrorでフォールバックすること', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const imageData = new Uint8ClampedArray(10 * 10 * 3);
        const page = createMockPage({
          viewportHeight: 800,
          textItems: [{ str: 'テキスト', transform: [1, 0, 0, 1, 50, 750] }],
          operatorList: {
            fnArray: [mockOPS.paintImageXObject],
            argsArray: [['img_1']],
          },
          objs: {
            img_1: { data: imageData, width: 10, height: 10 },
          },
        });
        createMockPdfDocument([page]);

        // canvas変換を失敗させる
        mockEncodeSync.mockImplementationOnce(() => {
          throw new Error('canvas conversion failed');
        });

        // Act & Assert
        await expect(strategy.extract('/path/to/doc.pdf')).rejects.toThrow(
          TextExtractorStrategyError,
        );
      });

      it('画像なしPDFでは全画像変換失敗フォールバックが誤発火しないこと', async () => {
        // Arrange
        const fileData = Buffer.from('fake-pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        const page = createMockPage({
          viewportHeight: 800,
          textItems: [
            { str: 'テキストのみ', transform: [1, 0, 0, 1, 50, 750] },
          ],
        });
        createMockPdfDocument([page]);

        // Act
        const result = await strategy.extract('/path/to/doc.pdf');

        // Assert: フォールバックせず正常に返ること
        expect(result.content).toContain('テキストのみ');
        expect(result.images).toEqual([]);
      });

      it('PDF解析エラーはTextExtractorStrategyErrorでラップされること', async () => {
        // Arrange
        const fileData = Buffer.from('corrupted-pdf');
        mockReadFileSync.mockReturnValue(fileData);

        const pdfError = new Error('Invalid PDF structure');
        mockGetDocument.mockReturnValue({
          promise: Promise.reject(pdfError),
        });

        // Act & Assert
        await expect(
          strategy.extract('/path/to/corrupted.pdf'),
        ).rejects.toThrow(TextExtractorStrategyError);

        try {
          await strategy.extract('/path/to/corrupted.pdf');
        } catch (error) {
          expect(error).toBeInstanceOf(TextExtractorStrategyError);
          expect((error as TextExtractorStrategyError).strategyType).toBe(
            'pdfjs-rich',
          );
          expect((error as TextExtractorStrategyError).cause).toBe(pdfError);
        }
      });

      it('TextExtractorStrategyErrorは再ラップされずそのままスローされること', async () => {
        // Arrange
        const fileData = Buffer.from('pdf-data');
        mockReadFileSync.mockReturnValue(fileData);

        // ページ数0のPDFでTextExtractorStrategyErrorが直接スローされるケースを検証
        createMockPdfDocument([]);

        // Act & Assert
        try {
          await strategy.extract('/path/to/empty.pdf');
          fail('エラーがスローされるべき');
        } catch (error) {
          // TextExtractorStrategyErrorがそのまま伝播し、再ラップされないこと
          expect(error).toBeInstanceOf(TextExtractorStrategyError);
          // cause が undefined (再ラップされていない)
          expect((error as TextExtractorStrategyError).cause).toBeUndefined();
        }
      });
    });
  });

  describe('CTMスタック安全性', () => {
    it('restore操作がsave操作より多い場合でもエラーにならない', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const page = createMockPage({
        viewportHeight: 800,
        textItems: [{ str: 'テスト', transform: [1, 0, 0, 1, 100, 700] }],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.restore,
            mockOPS.restore, // saveなしの余分なrestore
            mockOPS.restore, // さらに余分
          ],
          argsArray: [[], [], [], []],
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');
      expect(result.content).toContain('テスト');
    });
  });

  describe('非標準画像チャネル', () => {
    it('非標準チャネル数の画像はスキップされる', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      // チャネル数5の画像（非標準）
      const imageData = new Uint8ClampedArray(10 * 10 * 5);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [{ str: 'テキスト', transform: [1, 0, 0, 1, 100, 500] }],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintImageXObject,
            mockOPS.restore,
          ],
          argsArray: [[], [100, 0, 0, 100, 50, 700], ['img_nonstandard'], []],
        },
        objs: {
          img_nonstandard: { data: imageData, width: 10, height: 10 },
        },
      });
      createMockPdfDocument([page]);
      mockEncodeSync.mockReturnValue(Buffer.from('png_data'));

      const result = await strategy.extract('/path/to/test.pdf');

      // テキストは抽出されるが、非標準チャネル画像はスキップ
      expect(result.content).toContain('テキスト');
      expect(result.images).toEqual([]);
    });
  });

  describe('バージョン互換性テスト', () => {
    it('save/restoreなしのpaintImageXObjectを処理する', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const imageData = new Uint8ClampedArray(100 * 50 * 3);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [{ str: 'テスト', transform: [1, 0, 0, 1, 50, 750] }],
        operatorList: {
          fnArray: [mockOPS.transform, mockOPS.paintImageXObject],
          argsArray: [[200, 0, 0, 150, 50, 600], ['img_nosave']],
        },
        objs: {
          img_nosave: { data: imageData, width: 100, height: 50 },
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      expect(result.content).toContain('テスト');
      expect(result.images).toHaveLength(1);
    });

    it('3段ネストFormXObject内の画像を処理する', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const imageData = new Uint8ClampedArray(100 * 80 * 3);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [{ str: 'テスト', transform: [1, 0, 0, 1, 50, 750] }],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintFormXObjectBegin,
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintFormXObjectBegin,
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintImageXObject,
            mockOPS.restore,
            mockOPS.paintFormXObjectEnd,
            mockOPS.restore,
            mockOPS.paintFormXObjectEnd,
            mockOPS.restore,
          ],
          argsArray: [
            [],
            [1, 0, 0, 1, 0, 0],
            [],
            [],
            [1, 0, 0, 1, 0, 500],
            [],
            [],
            [100, 0, 0, 80, 50, 50],
            ['img_deep'],
            [],
            [],
            [],
            [],
            [],
          ],
        },
        objs: {
          img_deep: { data: imageData, width: 100, height: 80 },
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      expect(result.images).toHaveLength(1);
    });

    it('4チャンネル（CMYK）画像を処理する', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const imageData = new Uint8ClampedArray(50 * 50 * 4);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [{ str: 'CMYK', transform: [1, 0, 0, 1, 50, 750] }],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintImageXObject,
            mockOPS.restore,
          ],
          argsArray: [[], [100, 0, 0, 80, 50, 600], ['img_cmyk'], []],
        },
        objs: {
          img_cmyk: { data: imageData, width: 50, height: 50 },
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      expect(result.content).toContain('CMYK');
      expect(result.images).toHaveLength(1);
    });

    it('1チャンネル（グレースケール）画像を処理する', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const imageData = new Uint8ClampedArray(50 * 50 * 1);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [
          { str: 'グレースケール', transform: [1, 0, 0, 1, 50, 750] },
        ],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintImageXObject,
            mockOPS.restore,
          ],
          argsArray: [[], [100, 0, 0, 80, 50, 600], ['img_gray'], []],
        },
        objs: {
          img_gray: { data: imageData, width: 50, height: 50 },
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      expect(result.content).toContain('グレースケール');
      expect(result.images).toHaveLength(1);
    });

    it('テキストなし画像のみページを処理する', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const imageData = new Uint8ClampedArray(100 * 50 * 3);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintImageXObject,
            mockOPS.restore,
          ],
          argsArray: [[], [200, 0, 0, 150, 50, 600], ['img_only'], []],
        },
        objs: {
          img_only: { data: imageData, width: 100, height: 50 },
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      expect(result.content).toContain('#page:1');
      expect(result.content).toContain('![image](image_1.png)');
      expect(result.images).toHaveLength(1);
    });

    it('空文字列テキストアイテムをスキップする', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const page = createMockPage({
        viewportHeight: 800,
        textItems: [
          { str: '', transform: [1, 0, 0, 1, 50, 750] },
          { str: '実際のテキスト', transform: [1, 0, 0, 1, 50, 730] },
          { str: '', transform: [1, 0, 0, 1, 50, 710] },
        ],
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      expect(result.content).toContain('実際のテキスト');
    });

    it('複数transform累積後のpaintImageXObjectを処理する', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const imageData = new Uint8ClampedArray(100 * 50 * 3);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [{ str: 'テスト', transform: [1, 0, 0, 1, 50, 750] }],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.transform,
            mockOPS.transform,
            mockOPS.paintImageXObject,
            mockOPS.restore,
          ],
          argsArray: [
            [],
            [1, 0, 0, 1, 100, 200],
            [200, 0, 0, 150, 50, 300],
            ['img_multi'],
            [],
          ],
        },
        objs: {
          img_multi: { data: imageData, width: 100, height: 50 },
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      expect(result.images).toHaveLength(1);
    });

    it('負座標画像を処理する', async () => {
      const fileData = Buffer.from('fake-pdf-data');
      mockReadFileSync.mockReturnValue(fileData);

      const imageData = new Uint8ClampedArray(100 * 50 * 3);
      const page = createMockPage({
        viewportHeight: 800,
        textItems: [{ str: 'テスト', transform: [1, 0, 0, 1, 50, 750] }],
        operatorList: {
          fnArray: [
            mockOPS.save,
            mockOPS.transform,
            mockOPS.paintImageXObject,
            mockOPS.restore,
          ],
          argsArray: [[], [200, 0, 0, 150, -50, -100], ['img_neg'], []],
        },
        objs: {
          img_neg: { data: imageData, width: 100, height: 50 },
        },
      });
      createMockPdfDocument([page]);

      const result = await strategy.extract('/path/to/test.pdf');

      // 負座標でもエラーにならずに処理される
      expect(result.images).toHaveLength(1);
    });
  });
});
