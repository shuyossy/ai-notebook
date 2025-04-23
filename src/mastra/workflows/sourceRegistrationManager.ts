import fs from 'fs/promises';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { getStore } from '../../main/store';
import { sourceRegistrationWorkflow } from './sourceRegistration';
import getDb from '../../db';
import { sources } from '../../db/schema';
import FileExtractor from '../utils/fileExtractor';

/**
 * ディレクトリ内の全てのファイルを登録するワークフロー
 */
export default class SourceRegistrationManager {
  // eslint-disable-next-line
  private static instance: SourceRegistrationManager | null = null;

  private readonly registerDir: string;

  /**
   * ソースのステータスを更新するメソッド
   */
  private async updateSourceStatus(
    filePath: string,
    status: 'idle' | 'processing' | 'completed' | 'failed',
    error?: string,
  ): Promise<void> {
    if (!this.registerDir) {
      throw new Error('Register directory is not initialized');
    }
    const db = await getDb();
    await db
      .update(sources)
      .set({ status, error: error || null })
      .where(eq(sources.path, filePath));
  }

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
    const store = getStore();
    this.registerDir = store.get('source.registerDir');
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
              .where(
                and(
                  eq(sources.path, filePath),
                  eq(sources.status, 'completed'),
                ),
              );
            // 登録済みかつ完了状態のファイルは除外
            return existingSource.length === 0 ? filePath : null;
          }),
        ).then((results) =>
          results.filter((filePath): filePath is string => filePath !== null),
        );
      }

      // 各ファイルのステータスを更新中に設定
      const db = await getDb();
      // 既存のソースのステータスを更新
      await Promise.all(
        files.map((filePath) =>
          db
            .update(sources)
            .set({ status: 'processing', error: null })
            .where(eq(sources.path, filePath)),
        ),
      );

      // 新規ソースを登録
      await Promise.all(
        files.map(async (filePath) => {
          const existingSource = await db
            .select()
            .from(sources)
            .where(eq(sources.path, filePath));

          if (existingSource.length === 0) {
            await db.insert(sources).values({
              path: filePath,
              title: path.basename(filePath),
              summary: '',
              status: 'processing',
            });
          }
        }),
      );

      // files配列を reduce でたたみ込み、逐次処理を実現する
      const registrationResults = await files.reduce<
        Promise<{ success: boolean; filePath: string; error?: string }[]>
      >(
        // previousPromise: これまでの処理結果を含む Promise
        // filePath: 現在処理するファイルパス
        (previousPromise, filePath) => {
          return previousPromise.then(async (resultList) => {
            try {
              // ファイルからテキストを抽出
              const content = await FileExtractor.extractText(filePath);

              // ワークフローを開始
              const run = sourceRegistrationWorkflow.createRun();
              const result = await run.start({
                triggerData: { filePath, content },
              });

              // 失敗したステップを収集
              const failedSteps = Object.entries(result.results)
                .filter(
                  ([, value]) =>
                    value.status === 'failed' ||
                    // @ts-ignore
                    value.output?.status === 'failed',
                )
                .map(([step, outputObj]) => {
                  return {
                    step,
                    stepStatus: outputObj.status,
                    // @ts-ignore
                    errorMessage: outputObj.output?.errorMessage,
                  };
                });

              if (failedSteps.length > 0) {
                const errorMessages = failedSteps
                  .filter((step) => step.stepStatus === 'success')
                  .map(
                    (step) =>
                      `${step.step}: ${step.errorMessage || '不明なエラー'}`,
                  )
                  .join('\n\n');
                await this.updateSourceStatus(
                  filePath,
                  'failed',
                  errorMessages,
                );
                resultList.push({
                  success: false,
                  filePath,
                  error: errorMessages,
                });
                return resultList;
              }

              await this.updateSourceStatus(filePath, 'completed');
              resultList.push({ success: true, filePath });
            } catch (error) {
              // 失敗結果を配列に追加（エラー情報も保持）
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : 'Unknown error occurred';
              await this.updateSourceStatus(filePath, 'failed', errorMessage);
              console.error(error);
              resultList.push({
                success: false,
                filePath,
                error: errorMessage,
              });
            }
            // 次のイテレーションに結果配列を渡す
            return resultList;
          });
        },
        // 初期値：空の配列を返す Promise
        Promise.resolve([]),
      );

      // 成功件数をカウント
      const successCount = registrationResults.filter((r) => r.success).length;
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
        }
        return [fullPath];
      }),
    );

    // 配列の配列を平坦化して返却
    return nested.flat();
  }
}
