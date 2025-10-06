import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

/**
 * レビュー機能で使用するキャッシュファイルの管理ヘルパークラス
 */
export class ReviewCacheHelper {
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
   * @param documentId ドキュメントID
   * @param content テキスト内容
   * @returns ファイルパス
   */
  static async saveTextCache(
    reviewHistoryId: string,
    documentId: string,
    content: string,
  ): Promise<string> {
    const baseDir = this.getCacheBaseDir(reviewHistoryId);
    await fs.mkdir(baseDir, { recursive: true });

    const cachePath = path.join(baseDir, `${documentId}.txt`);
    await fs.writeFile(cachePath, content, 'utf-8');

    return cachePath;
  }

  /**
   * 画像キャッシュ保存（複数ページ対応）
   * @param reviewHistoryId レビュー履歴ID
   * @param documentId ドキュメントID
   * @param imageData Base64画像データ配列
   * @returns ディレクトリパス
   */
  static async saveImageCache(
    reviewHistoryId: string,
    documentId: string,
    imageData: string[],
  ): Promise<string> {
    const baseDir = this.getCacheBaseDir(reviewHistoryId);
    const imageCacheDir = path.join(baseDir, documentId);
    await fs.mkdir(imageCacheDir, { recursive: true });

    for (let i = 0; i < imageData.length; i++) {
      const pagePath = path.join(imageCacheDir, `page_${i}.b64`);
      await fs.writeFile(pagePath, imageData[i], 'utf-8');
    }

    return imageCacheDir;
  }

  /**
   * テキストキャッシュ読み込み
   * @param cachePath ファイルパス
   * @returns テキスト内容
   */
  static async loadTextCache(cachePath: string): Promise<string> {
    return fs.readFile(cachePath, 'utf-8');
  }

  /**
   * 画像キャッシュ読み込み
   * @param cacheDir ディレクトリパス
   * @returns Base64画像データ配列
   */
  static async loadImageCache(cacheDir: string): Promise<string[]> {
    const files = await fs.readdir(cacheDir);
    const imageFiles = files
      .filter((f) => f.endsWith('.b64'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/page_(\d+)\.b64/)?.[1] || '0');
        const bNum = parseInt(b.match(/page_(\d+)\.b64/)?.[1] || '0');
        return aNum - bNum;
      });

    const imageData: string[] = [];
    for (const file of imageFiles) {
      const content = await fs.readFile(path.join(cacheDir, file), 'utf-8');
      imageData.push(content);
    }

    return imageData;
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
