import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { sourceRegistrationWorkflow } from './sourceRegistration';
import getDb from '../../db';
import { sources } from '../../db/schema';
import FileExtractor from '../utils/fileExtractor';

/**
 * ディレクトリ内の全てのファイルを登録するワークフロー
 */
export default class SourceRegistrationManager {
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
  public static async registerFile(filePath: string): Promise<void> {
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
            const db = await getDb();
            const existingSource = await db
              .select()
              .from(sources)
              .where(eq(sources.path, filePath));
            // 登録数
            return existingSource.length === 0 ? filePath : null;
          }),
        ).then((results) =>
          results.filter((filePath): filePath is string => filePath !== null),
        );
      }

      // 各ファイルを並列に登録
      const registrationResults = await Promise.all(
        files.map(async (filePath) => {
          try {
            // ファイルからテキストを抽出
            const content = await FileExtractor.extractText(filePath);
            const run = sourceRegistrationWorkflow.createRun();
            await run.start({ triggerData: { filePath, content } });
            return { success: true, filePath };
          } catch (error) {
            // エラーをキャプチャして処理を続行
            return { success: false, filePath, error };
          }
        }),
      );
      // すべてのファイルの登録が完了
      const successCount = registrationResults.filter(
        (result) => result.success,
      ).length;

      console.log(`${successCount}件のファイルの登録が完了しました`);
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
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    // map して Promise<string[]> の配列を作成
    const nested = await Promise.all(
      items.map(async (item) => {
        const fullPath = path.join(dirPath, item.name);
        if (item.isDirectory()) {
          return this.readDirectoryRecursively(fullPath);
        } else {
          return [fullPath];
        }
      }),
    );

    // 配列の配列を平坦化して返却
    return nested.flat();
  }
}
