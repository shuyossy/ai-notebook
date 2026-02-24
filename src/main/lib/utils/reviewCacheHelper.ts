import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import type { ExtractedImage } from '@/types';

/**
 * キャッシュファイル読み込み失敗時にスローされるエラー
 */
export class CacheLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CacheLoadError';
    this.cause = cause;
  }
}

/**
 * 画像キャッシュメタデータの型
 */
interface ImageMetadataEntry {
  referenceId: string;
  mimeType: string;
}

/**
 * レビュー機能で使用するキャッシュファイルの管理ヘルパークラス
 */
export class ReviewCacheHelper {
  /**
   * Data URLプレフィックス（data:xxx;base64,）を除去する
   * @param data Base64データ（Data URLプレフィックス付きまたはなし）
   * @returns プレフィックスを除去した純粋なBase64文字列
   */
  private static stripDataUrlPrefix(data: string): string {
    return data.replace(/^data:[^;]+;base64,/, '');
  }

  /**
   * キャッシュベースディレクトリ取得
   */
  private static getCacheBaseDir(reviewHistoryId: string): string {
    return path.join(
      app.getPath('userData'),
      'review_cache',
      reviewHistoryId,
      'file_cache',
    );
  }

  /**
   * テキストキャッシュ保存
   * @param reviewHistoryId レビュー履歴ID
   * @param id ドキュメントキャッシュID
   * @param content テキスト内容
   * @returns ファイルパス
   */
  static async saveTextCache(
    reviewHistoryId: string,
    id: number,
    content: string,
  ): Promise<string> {
    const baseDir = this.getCacheBaseDir(reviewHistoryId);
    await fs.mkdir(baseDir, { recursive: true });

    const cachePath = path.join(baseDir, `${id}.txt`);
    await fs.writeFile(cachePath, content, 'utf-8');

    return cachePath;
  }

  /**
   * 画像キャッシュ保存（複数ページ対応）
   * @param reviewHistoryId レビュー履歴ID
   * @param id ドキュメントキャッシュID
   * @param imageData Base64画像データ配列
   * @returns ディレクトリパス
   */
  static async saveImageCache(
    reviewHistoryId: string,
    id: number,
    imageData: string[],
  ): Promise<string> {
    const baseDir = this.getCacheBaseDir(reviewHistoryId);
    const imageCacheDir = path.join(baseDir, `${id}`);
    await fs.mkdir(imageCacheDir, { recursive: true });

    for (let i = 0; i < imageData.length; i++) {
      const pagePath = path.join(imageCacheDir, `page_${i + 1}.png`);
      // Data URLプレフィックスを削除してからデコード
      const base64Data = this.stripDataUrlPrefix(imageData[i]);
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(pagePath, buffer);
    }

    return imageCacheDir;
  }

  /**
   * テキストキャッシュ読み込み
   * @param cachePath ファイルパス
   * @returns テキスト内容
   * @throws ファイルが存在しない場合やアクセスできない場合にエラーをスロー
   */
  static async loadTextCache(cachePath: string): Promise<string> {
    try {
      return await fs.readFile(cachePath, 'utf-8');
    } catch (error) {
      // ファイルが存在しない、またはアクセスできない場合
      throw new CacheLoadError(
        `Failed to load text cache from ${cachePath}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * 画像キャッシュ読み込み
   * @param cacheDir ディレクトリパス
   * @returns Base64画像データ配列
   * @throws ディレクトリが存在しない場合やアクセスできない場合にエラーをスロー
   */
  static async loadImageCache(cacheDir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(cacheDir);
      const imageFiles = files
        .filter((f) => f.endsWith('.png'))
        .sort((a, b) => {
          const aNum = parseInt(a.match(/page_(\d+)\.png/)?.[1] || '0');
          const bNum = parseInt(b.match(/page_(\d+)\.png/)?.[1] || '0');
          return aNum - bNum;
        });

      const imageData: string[] = [];
      for (const file of imageFiles) {
        const buffer = await fs.readFile(path.join(cacheDir, file));
        // Data URLプレフィックスを付加して返す
        imageData.push(`data:image/png;base64,${buffer.toString('base64')}`);
      }

      return imageData;
    } catch (error) {
      // ディレクトリが存在しない、またはアクセスできない場合
      throw new CacheLoadError(
        `Failed to load image cache from ${cacheDir}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * テキスト＋画像キャッシュ保存
   * テキストを.txtファイルに、画像を{id}_images/ディレクトリに保存する
   * @param reviewHistoryId レビュー履歴ID
   * @param id ドキュメントキャッシュID
   * @param content テキスト内容
   * @param images 抽出された画像データ
   * @returns テキストキャッシュファイルパス
   */
  static async saveTextWithImagesCache(
    reviewHistoryId: string,
    id: number,
    content: string,
    images: ExtractedImage[],
  ): Promise<string> {
    // テキストキャッシュ保存
    const textCachePath = await this.saveTextCache(
      reviewHistoryId,
      id,
      content,
    );

    // 画像がある場合のみ画像キャッシュを保存
    if (images.length > 0) {
      const baseDir = this.getCacheBaseDir(reviewHistoryId);
      const imageCacheDir = path.join(baseDir, `${id}_images`);
      await fs.mkdir(imageCacheDir, { recursive: true });

      // 各画像をバイナリファイルとして保存
      for (const image of images) {
        // パストラバーサル対策: referenceIdからファイル名部分のみ使用
        const safeFileName = path.basename(image.referenceId);
        const imagePath = path.join(imageCacheDir, safeFileName);
        // Data URLプレフィックスを削除してからデコード
        const base64Data = ReviewCacheHelper.stripDataUrlPrefix(
          image.base64Data,
        );
        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(imagePath, buffer);
      }

      // メタデータJSON保存
      const metadata: ImageMetadataEntry[] = images.map((img) => ({
        referenceId: img.referenceId,
        mimeType: img.mimeType,
      }));
      await fs.writeFile(
        path.join(imageCacheDir, '_metadata.json'),
        JSON.stringify(metadata),
        'utf-8',
      );
    }

    return textCachePath;
  }

  /**
   * テキストキャッシュパスから画像キャッシュを読み込み
   * @param textCachePath テキストキャッシュファイルパス（例: /path/{id}.txt）
   * @returns 抽出された画像データ（ディレクトリがない場合は空配列）
   */
  static async loadExtractedImagesCache(
    textCachePath: string,
  ): Promise<ExtractedImage[]> {
    try {
      // テキストキャッシュパスからIDを抽出して画像ディレクトリパスを導出
      const dir = path.dirname(textCachePath);
      const baseName = path.basename(textCachePath, '.txt');
      const imageCacheDir = path.join(dir, `${baseName}_images`);

      // ディレクトリの存在確認
      try {
        await fs.access(imageCacheDir);
      } catch {
        // ディレクトリが存在しない場合は空配列を返す（画像なしの場合）
        return [];
      }

      // メタデータ読み込み
      const metadataPath = path.join(imageCacheDir, '_metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: ImageMetadataEntry[] = JSON.parse(metadataContent);

      // 各画像ファイルをバイナリとして読み込み
      const images: ExtractedImage[] = [];
      for (const entry of metadata) {
        // パストラバーサル対策: referenceIdからファイル名部分のみ使用
        const imagePath = path.join(
          imageCacheDir,
          path.basename(entry.referenceId),
        );
        const buffer = await fs.readFile(imagePath);
        const base64Data = `data:${entry.mimeType};base64,${buffer.toString('base64')}`;
        images.push({
          referenceId: entry.referenceId,
          base64Data,
          mimeType: entry.mimeType,
        });
      }

      return images;
    } catch {
      // 読み込みエラーの場合は空配列を返す
      return [];
    }
  }

  /**
   * キャッシュディレクトリ削除
   * @param reviewHistoryId レビュー履歴ID
   */
  static async deleteCacheDirectory(reviewHistoryId: string): Promise<void> {
    const cacheDir = path.join(
      app.getPath('userData'),
      'review_cache',
      reviewHistoryId,
    );
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
}
