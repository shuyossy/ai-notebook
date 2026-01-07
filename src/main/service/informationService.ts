import { app } from 'electron';
import { RepositoryFiles } from '@gitbeaker/rest';
import { join } from 'path';
import fs from 'fs/promises';
import { InformationItem, InformationSchema } from '@/types';
import { getMainLogger } from '@/main/lib/logger';

const logger = getMainLogger();

// GitLab設定（プレースホルダー）
// TODO: 実際の値に置換してください
const GITLAB_HOST = 'https://gitlab.example.com';
const GITLAB_PROJECT_ID = 'your-group/information-repo';
const GITLAB_FILE_PATH = 'information.json';
const GITLAB_REF = 'main';

/**
 * お知らせサービスのインターフェース
 */
export interface IInformationService {
  /**
   * お知らせ情報を取得する
   */
  getInformations(): Promise<InformationItem[]>;
}

/**
 * お知らせサービスの実装
 * アプリ起動時にGitLab（本番）またはローカルファイル（開発）からお知らせを取得する
 */
export class InformationService implements IInformationService {
  // シングルトン変数
  private static instance: InformationService;

  // キャッシュ（セッション中に保持）
  private cachedInformations: InformationItem[] | null = null;

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): InformationService {
    if (!InformationService.instance) {
      InformationService.instance = new InformationService();
    }
    return InformationService.instance;
  }

  private constructor() {}

  /**
   * お知らせ情報を取得する
   * 開発環境ではローカルファイル、本番環境ではGitLabから取得
   */
  public async getInformations(): Promise<InformationItem[]> {
    // キャッシュがある場合はそれを返す
    if (this.cachedInformations !== null) {
      return this.cachedInformations;
    }

    try {
      let jsonContent: string;

      if (app.isPackaged) {
        // 本番環境: GitLabからファイルを取得
        jsonContent = await this.fetchFromGitLab();
      } else {
        // 開発環境: ローカルファイルを読み込む
        jsonContent = await this.readLocalFile();
      }

      // JSONをパース・バリデーション
      const parsed = JSON.parse(jsonContent);
      const validated = InformationSchema.parse(parsed);

      // order順にソートしてキャッシュに保存
      this.cachedInformations = validated.informations.sort(
        (a, b) => a.order - b.order,
      );

      logger.info(
        `お知らせ情報を取得しました: ${this.cachedInformations.length}件`,
      );

      return this.cachedInformations;
    } catch (error) {
      // エラー時は空配列を返す（サイレントフェイル）
      logger.warn('お知らせ情報の取得に失敗しました', error);
      this.cachedInformations = [];
      return [];
    }
  }

  /**
   * GitLabからinformation.jsonを取得
   */
  private async fetchFromGitLab(): Promise<string> {
    // publicリポジトリの場合、トークンなしでアクセス可能
    // GitBeakerはトークンが空文字の場合でも動作する
    const repositoryFiles = new RepositoryFiles({
      host: GITLAB_HOST,
      token: '', // publicリポジトリのためトークン不要
    });

    const fileContent = await repositoryFiles.showRaw(
      GITLAB_PROJECT_ID,
      GITLAB_FILE_PATH,
      GITLAB_REF,
    );

    // showRawはstring | Blobを返すので、stringに変換
    if (typeof fileContent === 'string') {
      return fileContent;
    }
    // Blobの場合
    return await fileContent.text();
  }

  /**
   * ローカルのinformation.jsonを読み込む
   */
  private async readLocalFile(): Promise<string> {
    // プロジェクトルートからの相対パス
    // __dirnameはdist/main/配下になるので、2階層上に移動
    const localPath = join(
      __dirname,
      '..',
      '..',
      'information',
      'information.json',
    );
    return await fs.readFile(localPath, 'utf-8');
  }

  /**
   * キャッシュをクリア（必要に応じて呼び出す）
   */
  public clearCache(): void {
    this.cachedInformations = null;
  }
}
