import fs from 'fs/promises';
import path from 'path';
import { and, eq, inArray } from 'drizzle-orm';
import type { StepResult } from '@mastra/core/workflows';
import { getStore } from '../../main/store';
import { getMastra } from '../../main/main';
import getDb from '../../db';
import { sources, topics } from '../../db/schema';
import FileExtractor from '../../main/utils/fileExtractor';

/**
 * ディレクトリ内の全てのファイルを登録するワークフロー
 */
export default class SourceRegistrationManager {
  // eslint-disable-next-line
  private static instance: SourceRegistrationManager | null = null;

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
   * ソースとそのキャッシュを削除
   * @param sourcePath ソースのパス
   */
  // eslint-disable-next-line
  private async deleteSourceAndCache(sourcePath: string): Promise<void> {
    try {
      const db = await getDb();
      // ソースIDを取得
      const source = await db
        .select()
        .from(sources)
        .where(eq(sources.path, sourcePath));
      const sourceId = source[0]?.id;
      if (!sourceId) {
        await db.delete(sources).where(eq(sources.id, sourceId));
        await db.delete(topics).where(eq(topics.sourceId, sourceId));
        if (FileExtractor.isCacheTarget(sourcePath)) {
          await FileExtractor.deleteCache(sourcePath);
        }
      }
    } catch (error) {
      console.error(`ソースの削除に失敗しました: ${sourcePath}`, error);
      throw error;
    }
  }

  /**
   * アプリ起動時に、処理中のソースを全て削除する
   */
  public async clearProcessingSources(): Promise<void> {
    try {
      const db = await getDb();
      // 削除対象のソースを取得
      const targetSources = await db
        .select()
        .from(sources)
        .where(inArray(sources.status, ['idle', 'processing']));

      // 各ソースを削除
      for (const source of targetSources) {
        await this.deleteSourceAndCache(source.path);
      }
    } catch (error) {
      console.error('処理中のソースの削除に失敗しました', error);
      throw error;
    }
  }

  /**
   * ディレクトリ内の全てのファイルを登録
   */
  public async registerAllFiles(excludeRegisteredFile = true): Promise<void> {
    try {
      const store = getStore();
      const { registerDir } = store.get('source');
      // ディレクトリ内のファイル一覧を取得
      let files = await this.readDirectoryRecursively(registerDir);

      // DB接続を一度だけ確立
      const db = await getDb();
      const allSources = await db.select().from(sources);

      // DBに存在するが実ファイルが存在しないソースを削除
      const existingPaths = new Set(files);
      const toDeleteSources = allSources.filter(
        (source) => !existingPaths.has(source.path),
      );
      if (toDeleteSources.length > 0) {
        for (const source of toDeleteSources) {
          await this.deleteSourceAndCache(source.path);
        }
        console.log(
          `${toDeleteSources.length}件の存在しないファイルのソース情報を削除しました`,
        );
      }

      // ディレクトリ内のファイルが存在しない場合は早期リターン
      if (files.length === 0) {
        console.log('登録するファイルが見つかりませんでした');
        return;
      }

      // 登録対象のファイルをフィルタリング（直列版）
      if (excludeRegisteredFile) {
        const filteredFiles: string[] = []; // 最終的に残すファイルを格納する配列

        // files 配列を１つずつ順番に処理
        for (const filePath of files) {
          // DB に同じパスで status が completed/idle/processing のレコードがあるか問い合わせ
          const existingSource = await db
            .select()
            .from(sources)
            .where(
              and(
                eq(sources.path, filePath),
                inArray(sources.status, ['completed', 'idle', 'processing']),
              ),
            );

          // レコードが見つからなかった（＝未登録 or ステータス未完了）ファイルだけ残す
          if (existingSource.length === 0) {
            filteredFiles.push(filePath);
          }
          // あれば何もしない（除外）
        }

        files = filteredFiles;
      }

      // 登録対象のファイルが存在しない場合は早期リターン
      if (files.length === 0) {
        console.log('登録するファイルが見つかりませんでした');
        return;
      }

      // 既存のソースを削除
      for (const filePath of files) {
        await this.deleteSourceAndCache(filePath);
      }

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

              // Mastraインスタンスからワークフローを取得して実行
              const mastra = getMastra();
              const workflow = mastra.getWorkflow('sourceRegistrationWorkflow');
              const run = workflow.createRun();
              const result = await run.start({
                triggerData: { filePath, content },
              });

              // 失敗したステップを収集
              const failedSteps = Object.entries(
                result.results as Record<
                  string,
                  StepResult<{
                    status: 'success' | 'failed';
                    errorMessage?: string;
                  }>
                >,
              )
                .filter(([, value]) => {
                  if (value.status === 'failed') {
                    return true;
                  }
                  if (
                    value.status === 'success' &&
                    value.output?.status === 'failed'
                  ) {
                    return true;
                  }
                  return false;
                })
                .map(([step, value]) => {
                  const errorMessage =
                    value.status === 'success'
                      ? value.output?.errorMessage
                      : undefined;
                  return {
                    step,
                    stepStatus: value.status,
                    errorMessage,
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
              await db
                .update(sources)
                .set({
                  status: 'failed' as const,
                  error:
                    error instanceof Error ? error.message : '不明なエラー',
                })
                .where(eq(sources.path, filePath));
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
        const fullPath = path.resolve(path.join(dirPath, item.name));
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
