import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import type { ImageMode } from '@/types';
import { getCustomAppDataDir } from '../../main';
import { getMainLogger } from '../logger';

const logger = getMainLogger();

/**
 * 画像変換キャッシュのメタデータ
 */
interface ImageCacheMetadata {
  filePath: string;
  lastModified: number;
  fileSize: number;
  imageMode: ImageMode;
  cachedAt: number;
  pageCount: number;
}

/**
 * 画像変換キャッシュヘルパークラス
 * ドキュメント登録機能とドキュメントレビュー機能で共通利用する
 */
export class ImageConversionCacheHelper {
  /**
   * キャッシュディレクトリのパスを取得
   */
  static getCacheDir(): string {
    const userDataPath = getCustomAppDataDir();
    const cacheDir = path.join(userDataPath, 'image_caches');

    // ディレクトリが存在しない場合は作成
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    return cacheDir;
  }

  /**
   * ファイルパスからキャッシュキー（ハッシュ）を生成
   */
  private static getCacheKey(filePath: string, imageMode: ImageMode): string {
    const hash = createHash('md5')
      .update(`${filePath}:${imageMode}`)
      .digest('hex');
    return hash;
  }

  /**
   * メタデータファイルのパスを取得
   */
  private static getMetadataPath(cacheKey: string): string {
    return path.join(this.getCacheDir(), `${cacheKey}.json`);
  }

  /**
   * 画像データディレクトリのパスを取得
   */
  private static getImageDataDir(cacheKey: string): string {
    return path.join(this.getCacheDir(), cacheKey);
  }

  /**
   * キャッシュから画像データを読み込み
   * @param filePath 元ファイルのパス
   * @param imageMode 画像化モード
   * @returns 画像データのBase64配列、キャッシュが有効でない場合はnull
   */
  static async tryReadCache(
    filePath: string,
    imageMode: ImageMode,
  ): Promise<string[] | null> {
    const cacheKey = this.getCacheKey(filePath, imageMode);
    const metadataPath = this.getMetadataPath(cacheKey);

    try {
      // メタデータを読み込み
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: ImageCacheMetadata = JSON.parse(metadataContent);

      // ファイルの現在の情報を取得
      const stats = await fs.stat(filePath);

      // ファイルが更新されている場合はキャッシュを無効とする
      if (stats.mtimeMs !== metadata.lastModified) {
        logger.debug(
          { filePath, metadataPath },
          'ファイルが更新されているため画像キャッシュを無効化します',
        );
        await this.deleteCache(filePath, imageMode);
        return null;
      }

      // imageModeが一致しない場合はキャッシュを無効とする（通常は発生しないがフェイルセーフ）
      if (metadata.imageMode !== imageMode) {
        logger.debug(
          { filePath, expected: imageMode, actual: metadata.imageMode },
          'imageModeが一致しないため画像キャッシュを無効化します',
        );
        await this.deleteCache(filePath, imageMode);
        return null;
      }

      // 画像データを読み込み
      const imageDataDir = this.getImageDataDir(cacheKey);
      const imageData = await this.loadImageData(imageDataDir, metadata.pageCount);

      if (imageData.length === 0) {
        logger.warn(
          { filePath, imageDataDir },
          '画像データが空のためキャッシュを無効化します',
        );
        await this.deleteCache(filePath, imageMode);
        return null;
      }

      logger.debug(
        { filePath, pageCount: imageData.length },
        '画像キャッシュを読み込みました',
      );

      return imageData;
    } catch (error) {
      // ファイルが存在しない場合やJSONパースエラーの場合は null を返す
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error({ error, filePath }, '画像キャッシュの読み込みに失敗しました');
      }
      return null;
    }
  }

  /**
   * 画像データをディレクトリから読み込み
   */
  private static async loadImageData(
    imageDataDir: string,
    expectedPageCount: number,
  ): Promise<string[]> {
    const imageData: string[] = [];

    for (let i = 0; i < expectedPageCount; i++) {
      const pagePath = path.join(imageDataDir, `page_${i}.b64`);
      try {
        const content = await fs.readFile(pagePath, 'utf-8');
        imageData.push(content);
      } catch (error) {
        logger.error(
          { error, pagePath },
          '画像ページの読み込みに失敗しました',
        );
        // 一部でも読み込めなければ失敗とする
        return [];
      }
    }

    return imageData;
  }

  /**
   * 画像データをキャッシュに保存
   * @param filePath 元ファイルのパス
   * @param imageMode 画像化モード
   * @param imageData Base64画像データ配列
   * @param stats ファイルの統計情報
   */
  static async saveCache(
    filePath: string,
    imageMode: ImageMode,
    imageData: string[],
    stats: { mtimeMs: number; size: number },
  ): Promise<void> {
    if (imageData.length === 0) {
      logger.warn({ filePath }, '空の画像データはキャッシュしません');
      return;
    }

    const cacheKey = this.getCacheKey(filePath, imageMode);
    const metadataPath = this.getMetadataPath(cacheKey);
    const imageDataDir = this.getImageDataDir(cacheKey);

    try {
      // 画像データディレクトリを作成
      await fs.mkdir(imageDataDir, { recursive: true });

      // 画像データを保存
      for (let i = 0; i < imageData.length; i++) {
        const pagePath = path.join(imageDataDir, `page_${i}.b64`);
        await fs.writeFile(pagePath, imageData[i], 'utf-8');
      }

      // メタデータを保存
      const metadata: ImageCacheMetadata = {
        filePath,
        lastModified: stats.mtimeMs,
        fileSize: stats.size,
        imageMode,
        cachedAt: Date.now(),
        pageCount: imageData.length,
      };
      await fs.writeFile(
        metadataPath,
        JSON.stringify(metadata, null, 2),
        'utf-8',
      );

      logger.debug(
        { filePath, pageCount: imageData.length, imageMode },
        '画像キャッシュを保存しました',
      );
    } catch (error) {
      // キャッシュが保存できない場合は大きな問題にならないのでエラーをログに出すだけ
      logger.error({ error, filePath }, '画像キャッシュの保存に失敗しました');
    }
  }

  /**
   * 指定ファイルの画像キャッシュを削除
   * @param filePath 元ファイルのパス
   * @param imageMode 画像化モード（指定しない場合は両モードを削除）
   */
  static async deleteCache(
    filePath: string,
    imageMode?: ImageMode,
  ): Promise<void> {
    const modes: ImageMode[] = imageMode ? [imageMode] : ['merged', 'pages'];

    for (const mode of modes) {
      const cacheKey = this.getCacheKey(filePath, mode);
      const metadataPath = this.getMetadataPath(cacheKey);
      const imageDataDir = this.getImageDataDir(cacheKey);

      try {
        // メタデータファイルを削除
        await fs.unlink(metadataPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error(error, '画像キャッシュメタデータの削除に失敗しました');
        }
      }

      try {
        // 画像データディレクトリを削除
        await fs.rm(imageDataDir, { recursive: true, force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error(error, '画像キャッシュデータの削除に失敗しました');
        }
      }
    }
  }

  /**
   * キャッシュディレクトリを全削除
   */
  static async cleanCacheDirectory(): Promise<void> {
    const cacheDir = this.getCacheDir();
    try {
      const entries = await fs.readdir(cacheDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(cacheDir, entry.name);
        if (entry.isDirectory()) {
          await fs.rm(entryPath, { recursive: true, force: true });
        } else {
          await fs.unlink(entryPath);
        }
      }

      logger.info('画像キャッシュディレクトリをクリーンアップしました');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(error, '画像キャッシュディレクトリのクリーンアップに失敗しました');
      }
    }
  }
}
