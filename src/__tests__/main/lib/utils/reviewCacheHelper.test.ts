/**
 * ReviewCacheHelper のテスト（画像キャッシュ機能）
 * @jest-environment node
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ExtractedImage } from '@/types';

// Electron app.getPath のモック
const testUserData = path.join(os.tmpdir(), 'ai-notebook-cache-test');

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => testUserData),
  },
}));

import { ReviewCacheHelper } from '@/main/lib/utils/reviewCacheHelper';

describe('ReviewCacheHelper', () => {
  const reviewHistoryId = 'test-review-history';

  beforeEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    await fs.rm(testUserData, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(testUserData, { recursive: true, force: true });
  });

  describe('saveTextWithImagesCache', () => {
    describe('正常系', () => {
      it('テキストのみ（画像なし）の場合、テキストファイルだけが保存されること', async () => {
        // Arrange
        const id = 1;
        const content = 'テストテキスト内容';
        const images: ExtractedImage[] = [];

        // Act
        const textCachePath = await ReviewCacheHelper.saveTextWithImagesCache(
          reviewHistoryId,
          id,
          content,
          images,
        );

        // Assert
        expect(textCachePath).toContain(`${id}.txt`);
        const savedContent = await fs.readFile(textCachePath, 'utf-8');
        expect(savedContent).toBe(content);

        // 画像ディレクトリが作成されていないことを確認
        const baseDir = path.dirname(textCachePath);
        const imageDirPath = path.join(baseDir, `${id}_images`);
        await expect(fs.access(imageDirPath)).rejects.toThrow();
      });

      it('テキスト＋画像がある場合、テキストファイルと画像ファイルが保存されること', async () => {
        // Arrange
        const id = 2;
        const content = 'テキスト with ![image](image_1.png)';
        const images: ExtractedImage[] = [
          {
            referenceId: 'image_1.png',
            base64Data: 'data:image/png;base64,iVBORw0KGgo=',
            mimeType: 'image/png',
          },
          {
            referenceId: 'image_2.jpg',
            base64Data: 'data:image/jpeg;base64,/9j/4AAQ=',
            mimeType: 'image/jpeg',
          },
        ];

        // Act
        const textCachePath = await ReviewCacheHelper.saveTextWithImagesCache(
          reviewHistoryId,
          id,
          content,
          images,
        );

        // Assert
        // テキストファイルが保存されていること
        const savedContent = await fs.readFile(textCachePath, 'utf-8');
        expect(savedContent).toBe(content);

        // 画像ディレクトリとファイルが作成されていること
        const baseDir = path.dirname(textCachePath);
        const imageDirPath = path.join(baseDir, `${id}_images`);

        const image1Data = await fs.readFile(
          path.join(imageDirPath, 'image_1.png'),
          'utf-8',
        );
        expect(image1Data).toBe('data:image/png;base64,iVBORw0KGgo=');

        const image2Data = await fs.readFile(
          path.join(imageDirPath, 'image_2.jpg'),
          'utf-8',
        );
        expect(image2Data).toBe('data:image/jpeg;base64,/9j/4AAQ=');

        // メタデータが保存されていること
        const metadataContent = await fs.readFile(
          path.join(imageDirPath, '_metadata.json'),
          'utf-8',
        );
        const metadata = JSON.parse(metadataContent);
        expect(metadata).toEqual([
          { referenceId: 'image_1.png', mimeType: 'image/png' },
          { referenceId: 'image_2.jpg', mimeType: 'image/jpeg' },
        ]);
      });
    });
  });

  describe('loadExtractedImagesCache', () => {
    describe('正常系', () => {
      it('画像キャッシュが存在する場合、正しく読み込めること', async () => {
        // Arrange: 先に保存
        const id = 3;
        const images: ExtractedImage[] = [
          {
            referenceId: 'img_a.png',
            base64Data: 'data:image/png;base64,AAA=',
            mimeType: 'image/png',
          },
        ];
        const textCachePath = await ReviewCacheHelper.saveTextWithImagesCache(
          reviewHistoryId,
          id,
          'テスト',
          images,
        );

        // Act
        const loadedImages =
          await ReviewCacheHelper.loadExtractedImagesCache(textCachePath);

        // Assert
        expect(loadedImages).toHaveLength(1);
        expect(loadedImages[0].referenceId).toBe('img_a.png');
        expect(loadedImages[0].base64Data).toBe('data:image/png;base64,AAA=');
        expect(loadedImages[0].mimeType).toBe('image/png');
      });

      it('複数画像がある場合、全て正しく読み込めること', async () => {
        // Arrange
        const id = 4;
        const images: ExtractedImage[] = [
          {
            referenceId: 'img_1.png',
            base64Data: 'base64data1',
            mimeType: 'image/png',
          },
          {
            referenceId: 'img_2.jpg',
            base64Data: 'base64data2',
            mimeType: 'image/jpeg',
          },
          {
            referenceId: 'img_3.gif',
            base64Data: 'base64data3',
            mimeType: 'image/gif',
          },
        ];
        const textCachePath = await ReviewCacheHelper.saveTextWithImagesCache(
          reviewHistoryId,
          id,
          'テスト',
          images,
        );

        // Act
        const loadedImages =
          await ReviewCacheHelper.loadExtractedImagesCache(textCachePath);

        // Assert
        expect(loadedImages).toHaveLength(3);
        expect(loadedImages.map((img) => img.referenceId)).toEqual([
          'img_1.png',
          'img_2.jpg',
          'img_3.gif',
        ]);
      });

      it('画像ディレクトリが存在しない場合（画像なし）、空配列を返すこと', async () => {
        // Arrange: テキストのみ保存（画像なし）
        const id = 5;
        const textCachePath = await ReviewCacheHelper.saveTextWithImagesCache(
          reviewHistoryId,
          id,
          'テキストのみ',
          [],
        );

        // Act
        const loadedImages =
          await ReviewCacheHelper.loadExtractedImagesCache(textCachePath);

        // Assert
        expect(loadedImages).toEqual([]);
      });

      it('存在しないテキストキャッシュパスの場合、空配列を返すこと', async () => {
        // Arrange
        const nonExistentPath = path.join(
          testUserData,
          'review_cache',
          'non-existent',
          'file_cache',
          '999.txt',
        );

        // Act
        const loadedImages =
          await ReviewCacheHelper.loadExtractedImagesCache(nonExistentPath);

        // Assert
        expect(loadedImages).toEqual([]);
      });
    });
  });

  describe('saveTextWithImagesCache → loadExtractedImagesCache の往復', () => {
    it('保存した画像データがそのまま読み込めること', async () => {
      // Arrange
      const id = 6;
      const originalImages: ExtractedImage[] = [
        {
          referenceId: 'chart_1.png',
          base64Data: 'data:image/png;base64,longbase64string==',
          mimeType: 'image/png',
        },
        {
          referenceId: 'photo_1.jpg',
          base64Data: 'data:image/jpeg;base64,anotherlongstring==',
          mimeType: 'image/jpeg',
        },
      ];

      // Act
      const textCachePath = await ReviewCacheHelper.saveTextWithImagesCache(
        reviewHistoryId,
        id,
        'テスト with ![image](chart_1.png) and ![image](photo_1.jpg)',
        originalImages,
      );
      const loadedImages =
        await ReviewCacheHelper.loadExtractedImagesCache(textCachePath);

      // Assert
      expect(loadedImages).toEqual(originalImages);
    });
  });

  describe('deleteCacheDirectory', () => {
    describe('正常系', () => {
      it('キャッシュディレクトリが存在する場合、削除されること', async () => {
        // Arrange: キャッシュを作成
        const id = 10;
        await ReviewCacheHelper.saveTextCache(
          reviewHistoryId,
          id,
          'テストデータ',
        );
        const cacheDir = path.join(
          testUserData,
          'review_cache',
          reviewHistoryId,
        );
        // ディレクトリが存在することを確認
        await expect(fs.access(cacheDir)).resolves.toBeUndefined();

        // Act
        await ReviewCacheHelper.deleteCacheDirectory(reviewHistoryId);

        // Assert: ディレクトリが削除されていること
        await expect(fs.access(cacheDir)).rejects.toThrow();
      });

      it('テキスト＋画像キャッシュを含むディレクトリが完全に削除されること', async () => {
        // Arrange: テキスト＋画像キャッシュを作成
        const id = 11;
        const images: ExtractedImage[] = [
          {
            referenceId: 'img.png',
            base64Data: 'data:image/png;base64,AAA=',
            mimeType: 'image/png',
          },
        ];
        await ReviewCacheHelper.saveTextWithImagesCache(
          reviewHistoryId,
          id,
          'テスト',
          images,
        );
        const cacheDir = path.join(
          testUserData,
          'review_cache',
          reviewHistoryId,
        );
        await expect(fs.access(cacheDir)).resolves.toBeUndefined();

        // Act
        await ReviewCacheHelper.deleteCacheDirectory(reviewHistoryId);

        // Assert
        await expect(fs.access(cacheDir)).rejects.toThrow();
      });

      it('存在しないキャッシュディレクトリの場合でもエラーにならないこと', async () => {
        // Act & Assert: force: true により存在しなくてもエラーにならない
        await expect(
          ReviewCacheHelper.deleteCacheDirectory('non-existent-id'),
        ).resolves.toBeUndefined();
      });
    });
  });
});
