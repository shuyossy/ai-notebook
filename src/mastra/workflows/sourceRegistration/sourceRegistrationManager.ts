import fs from 'fs/promises';
import path from 'path';
import { getStore } from '../../../main/store';
import FileExtractor from '../../../main/utils/fileExtractor';
import { mastra } from '../..';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import { checkStatus } from '../libs';

/**
 * フォルダ内の全てのファイルを登録するワークフロー
 */
export default class SourceRegistrationManager {
  // eslint-disable-next-line
  private static instance: SourceRegistrationManager | null = null;

  private sourceRepository = getSourceRepository();

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
      const result = await this.sourceRepository.deleteSourceByPath(sourcePath);
      if (result) {
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
      // 削除対象のソースを取得
      const targetSources = await this.sourceRepository.getSouorceInStatus([
        'processing',
        'idle',
      ]);

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
   * フォルダ内の全てのファイルを登録
   */
  public async registerAllFiles(excludeRegisteredFile = true): Promise<void> {
    try {
      const store = getStore();
      const { registerDir } = store.get('source');
      let files: string[] = [];
      if (registerDir.trim() !== '') {
        // フォルダ内のファイル一覧を取得
        files = await this.readDirectoryRecursively(registerDir);
      }

      // DB接続を一度だけ確立
      const allSources = await this.sourceRepository.getAllSources();

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

      // フォルダ内のファイルが存在しない場合は早期リターン
      if (files.length === 0) {
        console.log('登録するファイルが見つかりませんでした');
        return;
      }

      // 登録対象のファイルをフィルタリング（直列版）
      if (excludeRegisteredFile) {
        const filteredFiles: string[] = []; // 最終的に残すファイルを格納する配列

        // files 配列を１つずつ順番に処理
        for (const filePath of files) {
          // DB に同じパスで status が idle/processing のレコードがあるか問い合わせ
          const existingSource =
            await this.sourceRepository.getSourceByPathInStatus(filePath, [
              'completed',
            ]);

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
      await this.sourceRepository.insertSources(rows);

      // files配列を reduce でたたみ込み、逐次処理を実現する
      const registrationResults = await files.reduce<
        Promise<{ success: boolean; filePath: string }[]>
      >(
        // previousPromise: これまでの処理結果を含む Promise
        // filePath: 現在処理するファイルパス
        (previousPromise, filePath) => {
          return previousPromise.then(async (resultList) => {
            try {
              let success = false;
              // ファイルからテキストを抽出
              const { content } = await FileExtractor.extractText(filePath);

              // Mastraインスタンスからワークフローを取得して実行
              const workflow = mastra.getWorkflow('sourceRegistrationWorkflow');
              const run = workflow.createRun();
              const result = await run.start({
                inputData: { filePath, content },
              });

              // 結果を確認
              console.log('apply checkStatus', JSON.stringify(result));
              const checkResult = checkStatus(result);

              resultList.push({
                success: checkResult.status == 'success',
                filePath,
              });
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
   * フォルダを再帰的に読み込み、全てのファイルパスを取得
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
