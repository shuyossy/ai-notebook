/**
 * DocxMammothRichStrategy のテスト
 * @jest-environment node
 */

// fs/promises のモック
const mockReadFile = jest.fn();
jest.mock('fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}));

// mammoth のモック
const mockConvertToHtml = jest.fn();
const mockImgElement = jest.fn();
jest.mock('mammoth', () => ({
  convertToHtml: (...args: any[]) => mockConvertToHtml(...args),
  images: {
    imgElement: (...args: any[]) => mockImgElement(...args),
  },
}));

// DocxHtmlToTextConverter のモック
const mockConvert = jest.fn();
jest.mock('@/main/lib/textExtractor/DocxHtmlToTextConverter', () => ({
  DocxHtmlToTextConverter: jest.fn().mockImplementation(() => ({
    convert: (...args: any[]) => mockConvert(...args),
  })),
}));

// mimeUtils のモック
const mockGetExtFromMime = jest.fn();
const mockIsAiSupportedImageMime = jest.fn();
jest.mock('@/main/lib/textExtractor/mimeUtils', () => ({
  getExtFromMime: (...args: any[]) => mockGetExtFromMime(...args),
  isAiSupportedImageMime: (...args: any[]) => mockIsAiSupportedImageMime(...args),
}));

import { DocxMammothRichStrategy } from '@/main/lib/textExtractor/strategies/DocxMammothRichStrategy';
import { TextExtractorStrategyError } from '@/main/service/port/textExtractor';

describe('DocxMammothRichStrategy', () => {
  let strategy: DocxMammothRichStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new DocxMammothRichStrategy();

    // デフォルトのモック動作
    mockGetExtFromMime.mockReturnValue('png');
    mockIsAiSupportedImageMime.mockReturnValue(true);
  });

  describe('メタ情報', () => {
    it('サポートする拡張子が.docxであること', () => {
      expect(strategy.getSupportedExtensions()).toEqual(['.docx']);
    });

    it('戦略タイプがdocx-mammoth-richであること', () => {
      expect(strategy.getStrategyType()).toBe('docx-mammoth-rich');
    });

    it('フォーマットタイプがdocx-rich-v1であること', () => {
      expect(strategy.getFormatType()).toBe('docx-rich-v1');
    });
  });

  describe('extract', () => {
    describe('正常系', () => {
      it('テキストのみの抽出が成功すること', async () => {
        // Arrange
        const fakeBuffer = Buffer.from('fake-docx-content');
        mockReadFile.mockResolvedValue(fakeBuffer);

        // mammoth.images.imgElementはconvertImageオプション用のオブジェクトを返す
        const convertImageOption = { type: 'imgElement' };
        mockImgElement.mockReturnValue(convertImageOption);

        // mammoth.convertToHtmlは画像なしのHTMLを返す
        mockConvertToHtml.mockResolvedValue({
          value: '<p>テスト文書の内容</p>',
          messages: [],
        });

        // DocxHtmlToTextConverter.convertの戻り値
        mockConvert.mockReturnValue('テスト文書の内容');

        // Act
        const result = await strategy.extract('/path/to/doc.docx');

        // Assert
        expect(result.content).toBe('テスト文書の内容');
        expect(result.images).toEqual([]);
        expect(mockReadFile).toHaveBeenCalledWith('/path/to/doc.docx');
        expect(mockConvertToHtml).toHaveBeenCalledWith(
          { buffer: fakeBuffer },
          { convertImage: convertImageOption },
        );
        expect(mockConvert).toHaveBeenCalledWith('<p>テスト文書の内容</p>');
      });

      it('画像付きHTML変換が成功し、ExtractedImageが収集されること', async () => {
        // Arrange
        const fakeBuffer = Buffer.from('fake-docx-with-images');
        mockReadFile.mockResolvedValue(fakeBuffer);

        // mammoth.images.imgElementのコールバックをキャプチャして実行する
        mockImgElement.mockImplementation((callback: any) => {
          // imgElementの戻り値（convertImageオプション用）
          const convertImageOption = { type: 'imgElement', callback };
          return convertImageOption;
        });

        // convertToHtml実行時に、画像コールバックが呼ばれた状態をシミュレート
        mockConvertToHtml.mockImplementation(
          async (_input: any, options: any) => {
            // mammoth内部で呼ばれる画像ハンドラのコールバックを直接呼び出す
            const imageHandler = options.convertImage.callback;

            // 1つ目の画像
            const img1Result = await imageHandler({
              readAsBase64String: async () => 'aW1hZ2VfZGF0YV8x',
              contentType: 'image/png',
            });
            expect(img1Result).toEqual({ src: 'image_1.png' });

            // 2つ目の画像
            const img2Result = await imageHandler({
              readAsBase64String: async () => 'aW1hZ2VfZGF0YV8y',
              contentType: 'image/jpeg',
            });

            mockGetExtFromMime
              .mockReturnValueOnce('png')
              .mockReturnValueOnce('jpg');

            expect(img2Result).toEqual({ src: 'image_2.jpg' });

            return {
              value:
                '<p>テキスト</p><img src="image_1.png"/><img src="image_2.jpg"/>',
              messages: [],
            };
          },
        );

        // getExtFromMimeの戻り値設定（imgElementコールバック内で呼ばれる順序）
        mockGetExtFromMime
          .mockReturnValueOnce('png')
          .mockReturnValueOnce('jpg');

        mockConvert.mockReturnValue(
          'テキスト\n![image](image_1.png)\n![image](image_2.jpg)',
        );

        // Act
        const result = await strategy.extract('/path/to/doc_with_images.docx');

        // Assert
        expect(result.content).toBe(
          'テキスト\n![image](image_1.png)\n![image](image_2.jpg)',
        );
        expect(result.images).toHaveLength(2);
        expect(result.images[0]).toEqual({
          referenceId: 'image_1.png',
          base64Data: 'data:image/png;base64,aW1hZ2VfZGF0YV8x',
          mimeType: 'image/png',
        });
        expect(result.images[1]).toEqual({
          referenceId: 'image_2.jpg',
          base64Data: 'data:image/jpeg;base64,aW1hZ2VfZGF0YV8y',
          mimeType: 'image/jpeg',
        });
      });

      it('mammoth警告メッセージがある場合でも正常終了すること', async () => {
        // Arrange
        const fakeBuffer = Buffer.from('fake-docx-content');
        mockReadFile.mockResolvedValue(fakeBuffer);

        const convertImageOption = { type: 'imgElement' };
        mockImgElement.mockReturnValue(convertImageOption);

        mockConvertToHtml.mockResolvedValue({
          value: '<p>内容</p>',
          messages: [
            { type: 'warning', message: 'Unrecognized style' },
            { type: 'warning', message: 'Unknown element' },
          ],
        });

        mockConvert.mockReturnValue('内容');

        // Act
        const result = await strategy.extract('/path/to/doc.docx');

        // Assert
        expect(result.content).toBe('内容');
        expect(result.images).toEqual([]);
      });
    });

    describe('AI非互換画像のフィルタリング', () => {
      it('EMF画像のみのdocxの場合、imagesが空でsrcが空文字になること', async () => {
        // Arrange
        const fakeBuffer = Buffer.from('fake-docx-with-emf');
        mockReadFile.mockResolvedValue(fakeBuffer);

        mockImgElement.mockImplementation((callback: any) => {
          return { type: 'imgElement', callback };
        });

        mockConvertToHtml.mockImplementation(
          async (_input: any, options: any) => {
            const imageHandler = options.convertImage.callback;

            // EMF画像（AI非互換）
            mockIsAiSupportedImageMime.mockReturnValueOnce(false);
            const emfResult = await imageHandler({
              readAsBase64String: async () => 'emf_data',
              contentType: 'image/x-emf',
            });
            expect(emfResult).toEqual({ src: '' });

            return {
              value: '<p>テキスト</p><img src=""/>',
              messages: [],
            };
          },
        );

        mockConvert.mockReturnValue('テキスト');

        // Act
        const result = await strategy.extract('/path/to/doc_emf.docx');

        // Assert
        expect(result.images).toEqual([]);
      });

      it('PNG+EMF混在の場合、PNGのみ抽出されカウンタが連続すること', async () => {
        // Arrange
        const fakeBuffer = Buffer.from('fake-docx-mixed');
        mockReadFile.mockResolvedValue(fakeBuffer);

        mockImgElement.mockImplementation((callback: any) => {
          return { type: 'imgElement', callback };
        });

        mockConvertToHtml.mockImplementation(
          async (_input: any, options: any) => {
            const imageHandler = options.convertImage.callback;

            // 1つ目: PNG（AI互換）
            mockIsAiSupportedImageMime.mockReturnValueOnce(true);
            mockGetExtFromMime.mockReturnValueOnce('png');
            const pngResult = await imageHandler({
              readAsBase64String: async () => 'png_base64_data',
              contentType: 'image/png',
            });
            expect(pngResult).toEqual({ src: 'image_1.png' });

            // 2つ目: EMF（AI非互換）→ スキップ
            mockIsAiSupportedImageMime.mockReturnValueOnce(false);
            const emfResult = await imageHandler({
              readAsBase64String: async () => 'emf_data',
              contentType: 'image/x-emf',
            });
            expect(emfResult).toEqual({ src: '' });

            return {
              value: '<p>テキスト</p><img src="image_1.png"/><img src=""/>',
              messages: [],
            };
          },
        );

        mockConvert.mockReturnValue('テキスト\n![image](image_1.png)');

        // Act
        const result = await strategy.extract('/path/to/doc_mixed.docx');

        // Assert
        expect(result.images).toHaveLength(1);
        expect(result.images[0]).toEqual({
          referenceId: 'image_1.png',
          base64Data: 'data:image/png;base64,png_base64_data',
          mimeType: 'image/png',
        });
      });
    });

    describe('異常系', () => {
      it('ファイル読み込みエラーはそのまま伝播すること', async () => {
        // Arrange
        const ioError = new Error('ENOENT: no such file or directory');
        mockReadFile.mockRejectedValue(ioError);

        // Act & Assert
        await expect(strategy.extract('/path/to/missing.docx')).rejects.toThrow(
          ioError,
        );
        // TextExtractorStrategyErrorにラップされないことを確認
        await expect(
          strategy.extract('/path/to/missing.docx'),
        ).rejects.not.toBeInstanceOf(TextExtractorStrategyError);
      });

      it('mammoth変換エラーはTextExtractorStrategyErrorでラップされること', async () => {
        // Arrange
        const fakeBuffer = Buffer.from('corrupted-docx');
        mockReadFile.mockResolvedValue(fakeBuffer);

        const convertImageOption = { type: 'imgElement' };
        mockImgElement.mockReturnValue(convertImageOption);

        const mammothError = new Error('Invalid .docx file');
        mockConvertToHtml.mockRejectedValue(mammothError);

        // Act & Assert
        await expect(
          strategy.extract('/path/to/corrupted.docx'),
        ).rejects.toThrow(TextExtractorStrategyError);

        try {
          await strategy.extract('/path/to/corrupted.docx');
        } catch (error) {
          expect(error).toBeInstanceOf(TextExtractorStrategyError);
          expect((error as TextExtractorStrategyError).strategyType).toBe(
            'docx-mammoth-rich',
          );
          expect((error as TextExtractorStrategyError).cause).toBe(
            mammothError,
          );
        }
      });

      it('TextExtractorStrategyErrorは再throwされること', async () => {
        // Arrange
        const fakeBuffer = Buffer.from('docx-content');
        mockReadFile.mockResolvedValue(fakeBuffer);

        const convertImageOption = { type: 'imgElement' };
        mockImgElement.mockReturnValue(convertImageOption);

        const strategyError = new TextExtractorStrategyError(
          'docx-mammoth-rich',
        );
        mockConvertToHtml.mockRejectedValue(strategyError);

        // Act & Assert
        await expect(strategy.extract('/path/to/doc.docx')).rejects.toThrow(
          strategyError,
        );

        // 再ラップされず同じインスタンスであることを確認
        try {
          await strategy.extract('/path/to/doc.docx');
        } catch (error) {
          expect(error).toBe(strategyError);
        }
      });
    });
  });
});
