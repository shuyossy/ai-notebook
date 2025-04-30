/**
 * GitLabClient
 * GitLab APIとの通信を行うクライアントクラス
 * gitbeakerライブラリを使用して実装
 */

import {
  Gitlab,
  Projects,
  Users,
  Groups,
  MergeRequests,
  Issues,
  Branches,
  Tags,
  Jobs,
  Pipelines,
  Repositories,
  RepositoryFiles,
  Commits,
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

  private readonly projects: InstanceType<typeof Projects<false>>;

  private readonly users: InstanceType<typeof Users<false>>;

  private readonly groups: InstanceType<typeof Groups<false>>;

  private readonly mergeRequests: InstanceType<typeof MergeRequests<false>>;

  private readonly issues: InstanceType<typeof Issues<false>>;

  private readonly branches: InstanceType<typeof Branches<false>>;

  private readonly tags: InstanceType<typeof Tags<false>>;

  private readonly jobs: InstanceType<typeof Jobs<false>>;

  private readonly pipelines: InstanceType<typeof Pipelines<false>>;

  private readonly repositories: InstanceType<typeof Repositories<false>>;

  private readonly repositoryFiles: InstanceType<typeof RepositoryFiles<false>>;

  private readonly commits: InstanceType<typeof Commits<false>>;

  private readonly mergeRequestDiscussions: InstanceType<
    typeof MergeRequestDiscussions<false>
  >;

  private readonly mergeRequestNotes: InstanceType<
    typeof MergeRequestNotes<false>
  >;

  // キャッシュ: プロジェクト、グループなど
  private projectsCache: NameIdMapping[] = [];

  private groupsCache: NameIdMapping[] = [];

  private usersCache: NameIdMapping[] = [];

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

    // 各APIリソースのインスタンス化
    this.projects = new Projects({
      host: config.host,
      token: config.token,
    });

    this.users = new Users({
      host: config.host,
      token: config.token,
    });

    this.groups = new Groups({
      host: config.host,
      token: config.token,
    });

    this.mergeRequests = new MergeRequests({
      host: config.host,
      token: config.token,
    });

    this.issues = new Issues({
      host: config.host,
      token: config.token,
    });

    this.branches = new Branches({
      host: config.host,
      token: config.token,
    });

    this.tags = new Tags({
      host: config.host,
      token: config.token,
    });

    this.jobs = new Jobs({
      host: config.host,
      token: config.token,
    });

    this.pipelines = new Pipelines({
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

    this.commits = new Commits({
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
   * IDまたは名前からプロジェクトIDを解決する
   * @param value ID（数値）またはパス/名前（文字列）
   * @returns 解決されたプロジェクトID
   */
  async resolveProjectId(value: number | string): Promise<number> {
    // 既にIDなら変換不要
    if (typeof value === 'number') {
      return value;
    }

    // 文字列が数値表現なら変換
    if (!Number.isNaN(Number(value))) {
      return Number(value);
    }

    // プロジェクトキャッシュをロード
    if (this.projectsCache.length === 0) {
      await this.getProjects();
    }

    // 名前または名前空間付きパスからIDを検索
    const found = this.projectsCache.find(
      (item) =>
        item.name.toLowerCase() === value.toLowerCase() ||
        (item as any).path_with_namespace?.toLowerCase() ===
          value.toLowerCase(),
    );

    if (found) {
      return found.id;
    }

    try {
      // パスまたは名前で直接プロジェクトを取得
      const project = await this.projects.show(value);
      return project.id;
    } catch (error) {
      throw new Error(
        `エラーが発生しました: ${error}\nプロジェクトが見つかりません: ${value}`,
      );
    }
  }

  /**
   * IDまたは名前からグループIDを解決する
   * @param value ID（数値）または名前（文字列）
   * @returns 解決されたグループID
   */
  async resolveGroupId(value: number | string): Promise<number> {
    // 既にIDなら変換不要
    if (typeof value === 'number') {
      return value;
    }

    // 文字列が数値表現なら変換
    if (!Number.isNaN(Number(value))) {
      return Number(value);
    }

    // グループキャッシュをロード
    if (this.groupsCache.length === 0) {
      await this.getGroups();
    }

    // 名前または名前空間付きパスからIDを検索
    const found = this.groupsCache.find(
      (item) =>
        item.name.toLowerCase() === value.toLowerCase() ||
        (item as any).path?.toLowerCase() === value.toLowerCase(),
    );

    if (found) {
      return found.id;
    }

    try {
      // パスまたは名前で直接グループを取得
      const group = await this.groups.show(value);
      return group.id;
    } catch (error) {
      throw new Error(
        `エラーが発生しました: ${error}\nグループが見つかりません: ${value}`,
      );
    }
  }

  /**
   * IDまたは名前からユーザーIDを解決する
   * @param value ID（数値）またはユーザー名（文字列）
   * @returns 解決されたユーザーID
   */
  async resolveUserId(value: number | string): Promise<number> {
    // 既にIDなら変換不要
    if (typeof value === 'number') {
      return value;
    }

    // 文字列が数値表現なら変換
    if (!Number.isNaN(Number(value))) {
      return Number(value);
    }

    // ユーザーキャッシュをロード
    if (this.usersCache.length === 0) {
      await this.getUsers();
    }

    // ユーザー名からIDを検索
    const found = this.usersCache.find(
      (item) =>
        (item as any).username.toLowerCase() === value.toLowerCase() ||
        item.name.toLowerCase() === value.toLowerCase(),
    );

    if (found) {
      return found.id;
    }

    try {
      // ユーザー名で直接ユーザーを取得
      const users = await this.users.all({
        username: value,
      });

      if (users.length > 0) {
        return users[0].id;
      }
    } catch (error) {
      // エラー処理
      console.log(error);
    }
    throw new Error(`ユーザが見つかりません: ${value}`);
  }

  /**
   * プロジェクト一覧を取得
   * @returns プロジェクト一覧
   */
  async getProjects(): Promise<NameIdMapping[]> {
    if (this.projectsCache.length > 0) {
      return this.projectsCache;
    }

    try {
      const projects = await this.projects.all();
      this.projectsCache = projects.map((project) => ({
        id: project.id,
        name: project.name,
        path_with_namespace: project.path_with_namespace,
      }));

      return this.projectsCache;
    } catch (e) {
      console.error('GitLab API - プロジェクト一覧取得エラー:', e);
      throw e;
    }
  }

  /**
   * グループ一覧を取得
   * @returns グループ一覧
   */
  async getGroups(): Promise<NameIdMapping[]> {
    if (this.groupsCache.length > 0) {
      return this.groupsCache;
    }

    try {
      const groups = await this.groups.all();
      this.groupsCache = groups.map((group) => ({
        id: group.id,
        name: group.name,
        path: group.path,
      }));

      return this.groupsCache;
    } catch (e) {
      console.error('GitLab API - グループ一覧取得エラー:', e);
      throw e;
    }
  }

  /**
   * ユーザー一覧を取得
   * @returns ユーザー一覧
   */
  async getUsers(): Promise<NameIdMapping[]> {
    if (this.usersCache.length > 0) {
      return this.usersCache;
    }

    try {
      const users = await this.users.all();
      this.usersCache = users.map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
      }));

      return this.usersCache;
    } catch (e) {
      console.error('GitLab API - ユーザー一覧取得エラー:', e);
      throw e;
    }
  }

  /**
   * アクセス可能なAPIリソースを取得
   * @returns 各種APIリソース
   */
  getApiResources() {
    return {
      gitlab: this.gitlab,
      projects: this.projects,
      users: this.users,
      groups: this.groups,
      mergeRequests: this.mergeRequests,
      issues: this.issues,
      branches: this.branches,
      tags: this.tags,
      jobs: this.jobs,
      pipelines: this.pipelines,
      repositories: this.repositories,
      repositoryFiles: this.repositoryFiles,
      commits: this.commits,
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
