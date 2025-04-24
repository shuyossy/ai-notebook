import fs from 'fs/promises';
import path from 'path';
import { and, eq, inArray } from 'drizzle-orm';
import { getStore } from '../../main/store';
import { sourceRegistrationWorkflow } from './sourceRegistration';
import getDb from '../../db';
import { sources } from '../../db/schema';
import FileExtractor from '../../main/utils/fileExtractor';

/**
 * ディレクトリ内の全てのファイルを登録するワークフロー
 */
export default class SourceRegistrationManager {
  // eslint-disable-next-line
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

      // ファイルが存在しない場合は早期リターン
      if (files.length === 0) {
        console.log('登録するファイルが見つかりませんでした');
        return;
      }

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

      // 登録対象のファイルが存在しない場合は早期リターン
      if (files.length === 0) {
        console.log('登録するファイルが見つかりませんでした');
        return;
      }

      // 登録済みかつ完了状態ではないファイルについてはDBから全削除
      // 処理中のtopicsテーブルも削除
      const db = await getDb();
      await db.delete(sources).where(
        inArray(sources.path, files), // path が files のいずれか
      );

      // ソースをDBに登録
      const rows = files.map((filePath) => ({
        path: filePath,
        title: path.basename(filePath),
        summary: '',
        status: 'idle' as const,
      }));
      await db.insert(sources).values(rows);

      // files配列を reduce でたたみ込み、逐次処理を実現する
      const registrationResults = await files.reduce<
        Promise<{ success: boolean; filePath: string }[]>
      >(
        // previousPromise: これまでの処理結果を含む Promise
        // filePath: 現在処理するファイルパス
        (previousPromise, filePath) => {
          return previousPromise.then(async (resultList) => {
            try {
              // ファイルからテキストを抽出
              const { content } = await FileExtractor.extractText(filePath);

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
                resultList.push({
                  success: false,
                  filePath,
                });
                return resultList;
              }

              resultList.push({ success: true, filePath });
            } catch (error) {
              console.error(error);
              resultList.push({
                success: false,
                filePath,
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
