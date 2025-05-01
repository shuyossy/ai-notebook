/**
 * GitLabClient
 * GitLab APIとの通信を行うクライアントクラス
 * gitbeakerライブラリを使用して実装
 */

import {
  Gitlab,
  MergeRequests,
  Repositories,
  RepositoryFiles,
  MergeRequestDiscussions,
  MergeRequestNotes,
} from '@gitbeaker/rest';
import { z } from 'zod';

/**
 * GitLabクライアント設定のインターフェース
 */
export interface GitLabClientConfig {
  /**
   * GitLabのホストURL（例: https://gitlab.com）
   */
  host: string;

  /**
   * GitLab APIトークン
   */
  token: string;
}

/**
 * エンティティの名前とIDのマッピング用インターフェース
 */
export interface NameIdMapping {
  id: number;
  name: string;
}

/**
 * GitLab APIクライアントクラス
 */
export class GitLabClient {
  private readonly gitlab: InstanceType<typeof Gitlab<false>>;

  private readonly mergeRequests: InstanceType<typeof MergeRequests<false>>;

  private readonly repositories: InstanceType<typeof Repositories<false>>;

  private readonly repositoryFiles: InstanceType<typeof RepositoryFiles<false>>;

  private readonly mergeRequestDiscussions: InstanceType<
    typeof MergeRequestDiscussions<false>
  >;

  private readonly mergeRequestNotes: InstanceType<
    typeof MergeRequestNotes<false>
  >;

  /**
   * コンストラクタ
   * @param config GitLabClientConfig - クライアント設定
   */
  constructor(config: GitLabClientConfig) {
    // GitLabクライアントの初期化
    this.gitlab = new Gitlab({
      host: config.host,
      token: config.token,
    });

    this.mergeRequests = new MergeRequests({
      host: config.host,
      token: config.token,
    });

    this.repositories = new Repositories({
      host: config.host,
      token: config.token,
    });

    this.repositoryFiles = new RepositoryFiles({
      host: config.host,
      token: config.token,
    });

    this.mergeRequestDiscussions = new MergeRequestDiscussions({
      host: config.host,
      token: config.token,
    });

    this.mergeRequestNotes = new MergeRequestNotes({
      host: config.host,
      token: config.token,
    });
  }

  /**
   * アクセス可能なAPIリソースを取得
   * @returns 各種APIリソース
   */
  getApiResources() {
    return {
      gitlab: this.gitlab,
      mergeRequests: this.mergeRequests,
      repositories: this.repositories,
      repositoryFiles: this.repositoryFiles,
      mergeRequestDiscussions: this.mergeRequestDiscussions,
      mergeRequestNotes: this.mergeRequestNotes,
    };
  }
}

/**
 * GitLabClientのfactory関数
 * @param config GitLabClientの設定
 * @returns GitLabClientのインスタンス
 */
export const createGitLabClient = (
  config: GitLabClientConfig,
): GitLabClient => {
  return new GitLabClient(config);
};

/**
 * GitLabClient設定のZodスキーマ
 */
export const gitlabClientConfigSchema = z.object({
  host: z.string().url('有効なGitLab APIのURLを入力してください'),
  token: z.string().min(1, 'GitLabのトークンを入力してください'),
});
