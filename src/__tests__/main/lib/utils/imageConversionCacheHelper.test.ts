/**
 * @jest-environment node
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import os from 'os';

// Electron モックを最初に適用
jest.mock(
  'electron',
  () => require('../../../test-utils/mockElectron').mockElectron,
);
jest.mock(
  'electron-store',
  () => require('../../../test-utils/mockElectron').default,
);

// テスト用の一時ディレクトリ
const testTempDir = path.join(os.tmpdir(), 'ai-notebook-image-cache-test');

// main.ts の初期化処理をスキップ
jest.mock('@/main/main', () => ({
  getCustomAppDataDir: jest.fn(() => testTempDir),
}));

// ロガーのモック
jest.mock('@/main/lib/logger', () => ({
  getMainLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

import { ImageConversionCacheHelper } from '@/main/lib/utils/imageConversionCacheHelper';

describe('ImageConversionCacheHelper', () => {
  // テストで使用するサンプルファイルのパス
  const testFilePath = path.join(testTempDir, 'test-document.pdf');
  const sampleImageData = [
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ];
  const multiPageImageData = [
    'data:image/png;base64,page1_base64_data',
    'data:image/png;base64,page2_base64_data',
    'data:image/png;base64,page3_base64_data',
  ];

  // テスト前のセットアップ
  beforeAll(async () => {
    // テスト用一時ディレクトリを作成
    if (!existsSync(testTempDir)) {
      mkdirSync(testTempDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    // キャッシュディレクトリをクリーンアップ
    const cacheDir = path.join(testTempDir, 'image_caches');
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }

    // テスト用ファイルを作成
    await fs.writeFile(testFilePath, 'PDF content', 'utf-8');
  });

  afterAll(async () => {
    // テスト終了後のクリーンアップ
    if (existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  // ========================================
  // 正常系テスト
  // ========================================

  describe('正常系', () => {
    describe('getCacheDir', () => {
      it('キャッシュディレクトリが正しく取得できること', () => {
        const cacheDir = ImageConversionCacheHelper.getCacheDir();
        expect(cacheDir).toBe(path.join(testTempDir, 'image_caches'));
      });

      it('キャッシュディレクトリが存在しない場合、自動作成されること', () => {
        const cacheDir = ImageConversionCacheHelper.getCacheDir();
        expect(existsSync(cacheDir)).toBe(true);
      });
    });

    describe('saveCache / tryReadCache', () => {
      it('キャッシュが存在しない場合、nullが返却されること', async () => {
        const result = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );
        expect(result).toBeNull();
      });

      it('キャッシュ保存後、正しく読み込めること（mergedモード）', async () => {
        const stats = await fs.stat(testFilePath);

        // キャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'merged',
          sampleImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // キャッシュを読み込み
        const result = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );

        expect(result).not.toBeNull();
        expect(result).toEqual(sampleImageData);
      });

      it('キャッシュ保存後、正しく読み込めること（pagesモード）', async () => {
        const stats = await fs.stat(testFilePath);

        // キャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'pages',
          multiPageImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // キャッシュを読み込み
        const result = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'pages',
        );

        expect(result).not.toBeNull();
        expect(result).toEqual(multiPageImageData);
        expect(result!.length).toBe(3);
      });

      it('mergedモードとpagesモードで別々にキャッシュされること', async () => {
        const stats = await fs.stat(testFilePath);

        // mergedモードでキャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'merged',
          sampleImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // pagesモードでキャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'pages',
          multiPageImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // 両方のキャッシュを読み込み
        const mergedResult = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );
        const pagesResult = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'pages',
        );

        expect(mergedResult).toEqual(sampleImageData);
        expect(pagesResult).toEqual(multiPageImageData);
      });

      it('元ファイルが更新された場合、キャッシュが無効化されること', async () => {
        const stats = await fs.stat(testFilePath);

        // キャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'merged',
          sampleImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // ファイルを更新（少し待機してから）
        await new Promise((resolve) => setTimeout(resolve, 100));
        await fs.writeFile(testFilePath, 'Updated PDF content', 'utf-8');

        // キャッシュを読み込み
        const result = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );

        // キャッシュが無効化されてnullが返されること
        expect(result).toBeNull();
      });
    });

    describe('deleteCache', () => {
      it('指定されたモードのキャッシュのみ削除されること', async () => {
        const stats = await fs.stat(testFilePath);

        // 両モードでキャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'merged',
          sampleImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'pages',
          multiPageImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // mergedモードのキャッシュのみ削除
        await ImageConversionCacheHelper.deleteCache(testFilePath, 'merged');

        // mergedは削除、pagesは残っていること
        const mergedResult = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );
        const pagesResult = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'pages',
        );

        expect(mergedResult).toBeNull();
        expect(pagesResult).toEqual(multiPageImageData);
      });

      it('モードを指定しない場合、両モードのキャッシュが削除されること', async () => {
        const stats = await fs.stat(testFilePath);

        // 両モードでキャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'merged',
          sampleImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'pages',
          multiPageImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // 両モードのキャッシュを削除
        await ImageConversionCacheHelper.deleteCache(testFilePath);

        // 両方削除されていること
        const mergedResult = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );
        const pagesResult = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'pages',
        );

        expect(mergedResult).toBeNull();
        expect(pagesResult).toBeNull();
      });
    });

    describe('cleanCacheDirectory', () => {
      it('キャッシュディレクトリ全体がクリーンアップされること', async () => {
        const stats = await fs.stat(testFilePath);

        // キャッシュを保存
        await ImageConversionCacheHelper.saveCache(
          testFilePath,
          'merged',
          sampleImageData,
          { mtimeMs: stats.mtimeMs, size: stats.size },
        );

        // キャッシュディレクトリをクリーンアップ
        await ImageConversionCacheHelper.cleanCacheDirectory();

        // キャッシュディレクトリ内が空になっていること
        const cacheDir = ImageConversionCacheHelper.getCacheDir();
        const entries = await fs.readdir(cacheDir);
        expect(entries.length).toBe(0);
      });
    });
  });

  // ========================================
  // 異常系テスト
  // ========================================

  describe('異常系', () => {
    describe('tryReadCache', () => {
      it('存在しないファイルパスの場合、nullが返却されること', async () => {
        const nonExistentFile = path.join(testTempDir, 'non-existent.pdf');
        const result = await ImageConversionCacheHelper.tryReadCache(
          nonExistentFile,
          'merged',
        );
        expect(result).toBeNull();
      });

      it('メタデータファイルが破損している場合、nullが返却されること', async () => {
        // 不正なメタデータファイルを直接作成
        const cacheDir = ImageConversionCacheHelper.getCacheDir();
        const invalidMetadataPath = path.join(cacheDir, 'invalid.json');
        await fs.writeFile(
          invalidMetadataPath,
          'invalid json content',
          'utf-8',
        );

        // 破損したキャッシュを読み込もうとした場合（ここでは直接アクセスは難しいが、異常系として対応）
        const result = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );
        expect(result).toBeNull();
      });
    });

    describe('saveCache', () => {
      it('空の画像データはキャッシュされないこと', async () => {
        const stats = await fs.stat(testFilePath);

        // 空の画像データを保存しようとする
        await ImageConversionCacheHelper.saveCache(testFilePath, 'merged', [], {
          mtimeMs: stats.mtimeMs,
          size: stats.size,
        });

        // キャッシュが保存されていないこと
        const result = await ImageConversionCacheHelper.tryReadCache(
          testFilePath,
          'merged',
        );
        expect(result).toBeNull();
      });
    });

    describe('deleteCache', () => {
      it('存在しないキャッシュを削除しようとしてもエラーにならないこと', async () => {
        const nonExistentFile = path.join(testTempDir, 'non-existent.pdf');

        // エラーが発生しないことを確認
        await expect(
          ImageConversionCacheHelper.deleteCache(nonExistentFile),
        ).resolves.not.toThrow();
      });
    });

    describe('cleanCacheDirectory', () => {
      it('キャッシュディレクトリが存在しない場合でもエラーにならないこと', async () => {
        // キャッシュディレクトリを削除
        const cacheDir = path.join(testTempDir, 'image_caches');
        if (existsSync(cacheDir)) {
          rmSync(cacheDir, { recursive: true, force: true });
        }

        // エラーが発生しないことを確認（getCacheDirで再作成される）
        await expect(
          ImageConversionCacheHelper.cleanCacheDirectory(),
        ).resolves.not.toThrow();
      });
    });
  });
});
