import fs from 'fs/promises';
import path from 'path';
import { sourceRegistrationWorkflow } from '@/mastra/workflows/sourceRegistration';
import { db } from '@/db';
import { sources } from '@/db/schema';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { FileExtractor } from '@/mastra/utils/fileExtractor';

/**
 * ディレクトリ内の全てのファイルを登録するワークフロー
 */
export class SourceRegistrationManager {
  private static instance: SourceRegistrationManager | null = null;
  private readonly registerDir: string;

  /**
   * シングルトンインスタンスを取得するメソッド
   */
  public static getInstance(): SourceRegistrationManager {
    if (!SourceRegistrationManager.instance) {
      SourceRegistrationManager.instance = new SourceRegistrationManager();
    }
    return SourceRegistrationManager.instance;
  }

  /**
   * 環境変数から設定を読み込む非公開コンストラクタ
   */
  private constructor() {
    // 登録ディレクトリの確認
    if (!process.env.REGISTER_FILE_DIR) {
      throw new Error('REGISTER_FILE_DIR環境変数が設定されていません');
    }

    this.registerDir = process.env.REGISTER_FILE_DIR;
  }

  /**
   * 指定したファイルのみを登録する
   */
  public async registerFile(filePath: string): Promise<void> {
    try {
      // ファイルの存在確認
      await fs.access(filePath);

      // ファイルからテキストを抽出
      const content = await FileExtractor.extractText(filePath);

      // ワークフローを開始
      const run = sourceRegistrationWorkflow.createRun();
      await run.start({ triggerData: { filePath, content } });

      console.log(`ファイルを登録しました: ${filePath}`);
    } catch (error) {
      console.error(`ファイル登録に失敗しました: ${filePath}`, error);
    }
  }

  /**
   * ディレクトリ内の全てのファイルを登録
   */
  public async registerAllFiles(excludeRegisteredFile = true): Promise<void> {
    try {
      // ディレクトリ内のファイル一覧を取得
      let files = await this.readDirectoryRecursively(this.registerDir);

      // 登録対象のファイルをフィルタリング
      if (excludeRegisteredFile) {
        files = await Promise.all(
          files.map(async (filePath) => {
            const existingSource = await db
              .select()
              .from(sources)
              .where(eq(sources.path, filePath));
            console.log(`登録数: ${existingSource.length}`);
            return existingSource.length === 0 ? filePath : null;
          })
        ).then(results => results.filter((filePath): filePath is string => filePath !== null));
      }

      // 各ファイルを順番に登録
      for (const filePath of files) {
        try {
          console.log(`ファイルを登録中: ${filePath}`);
          // ファイルからテキストを抽出
          const content = await FileExtractor.extractText(filePath);
          const run = sourceRegistrationWorkflow.createRun();
          await run.start({ triggerData: { filePath, content } });
          console.log(`ファイルを登録しました: ${filePath}`);
        } catch (error) {
          console.error(`ファイル登録に失敗しました: ${filePath}`, error);
          // 一つのファイルの失敗が全体の処理を妨げないよう、エラーはキャッチするがスローしない
        }
      }

      console.log('すべてのファイルの登録が完了しました');
    } catch (error) {
      console.error('ファイル登録処理に失敗しました', error);
      throw error;
    }
  }

  /**
   * ディレクトリを再帰的に読み込み、全てのファイルパスを取得
   * @param dirPath ディレクトリパス
   * @returns ファイルパスの配列
   */
  private async readDirectoryRecursively(dirPath: string): Promise<string[]> {
    let results: string[] = [];
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        // ディレクトリの場合は再帰的に処理
        const subDirFiles = await this.readDirectoryRecursively(fullPath);
        results = results.concat(subDirFiles);
      } else {
        // ファイルの場合はリストに追加
        results.push(fullPath);
      }
    }

    return results;
  }
}
