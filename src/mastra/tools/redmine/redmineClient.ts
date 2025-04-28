/**
 * RedmineClient
 * Redmine APIとの通信を行うクライアントクラス
 */

import { z } from 'zod';

/**
 * Redmineクライアント設定のインターフェース
 */
export interface RedmineClientConfig {
  /**
   * RedmineのAPIエンドポイントURL
   */
  apiUrl: string;

  /**
   * Redmine APIキー
   */
  apiKey: string;
}

/**
 * エンティティの名前とIDのマッピング用インターフェース
 */
export interface NameIdMapping {
  id: number;
  name: string;
}

/**
 * Redmine APIクライアントクラス
 */
export class RedmineClient {
  private readonly apiUrl: string;

  private readonly apiKey: string;

  // キャッシュ: プロジェクト、ユーザー、トラッカー、ステータス、優先度など
  private projectsCache: NameIdMapping[] | null = null;

  private usersCache: NameIdMapping[] | null = null;

  private trackersCache: NameIdMapping[] | null = null;

  private statusesCache: NameIdMapping[] | null = null;

  private prioritiesCache: NameIdMapping[] | null = null;

  /* コンストラクタ
   * @param config RedmineClientConfig - クライアント設定
   */
  constructor(config: RedmineClientConfig) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
  }

  /**
   * RedmineのRESTリクエストを実行する
   * @param path APIパス
   * @param method HTTPメソッド
   * @param data リクエストデータ
   * @returns レスポンスデータ
   */
  async request<T>(
    path: string,
    data?: any,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  ): Promise<T> {
    const url = new URL(path, this.apiUrl);

    // GETリクエストの場合はクエリパラメータとしてAPIキーを付与
    if (method === 'GET') {
      url.searchParams.append('key', this.apiKey);
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // GET以外のリクエストではAuthorizationヘッダーでAPIキーを送信
    if (method !== 'GET') {
      headers['X-Redmine-API-Key'] = this.apiKey;
    }

    const options: RequestInit = {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    };

    try {
      const response = await fetch(url.toString(), options);

      if (!response.ok) {
        throw new Error(
          `Redmine API Error: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      console.error('Redmine API Request failed:', error);
      throw error;
    }
  }

  /**
   * IDまたは名前からIDを解決する
   * @param value ID（数値）または名前（文字列）
   * @param mappings 名前→IDのマッピング配列
   * @returns 解決されたID
   */
  async resolveId(
    value: number | string,
    mappings: NameIdMapping[],
  ): Promise<number> {
    // 既にIDなら変換不要
    if (typeof value === 'number') {
      return value;
    }

    // 文字列が数値表現なら変換
    if (!isNaN(Number(value))) {
      return Number(value);
    }

    // 名前からIDを検索
    const found = mappings.find(
      (item) => item.name.toLowerCase() === value.toLowerCase(),
    );
    if (found) {
      return found.id;
    }

    throw new Error(`Unable to resolve ID for: ${value}`);
  }

  /**
   * プロジェクト一覧を取得してIDマッピングを返す
   * @returns プロジェクトの名前とIDのマッピング配列
   */
  async getProjects(): Promise<NameIdMapping[]> {
    if (this.projectsCache) {
      return this.projectsCache;
    }

    interface ProjectsResponse {
      projects: Array<{
        id: number;
        name: string;
      }>;
    }

    const response = await this.request<ProjectsResponse>('projects.json');
    this.projectsCache = response.projects.map((project) => ({
      id: project.id,
      name: project.name,
    }));

    return this.projectsCache;
  }

  /**
   * ユーザー一覧を取得してIDマッピングを返す
   * @returns ユーザーの名前とIDのマッピング配列
   */
  async getUsers(): Promise<NameIdMapping[]> {
    if (this.usersCache) {
      return this.usersCache;
    }

    interface UsersResponse {
      users: Array<{
        id: number;
        firstname: string;
        lastname: string;
      }>;
    }

    const response = await this.request<UsersResponse>('users.json');
    this.usersCache = response.users.map((user) => ({
      id: user.id,
      name: `${user.firstname} ${user.lastname}`.trim(),
    }));

    return this.usersCache;
  }

  /**
   * トラッカー一覧を取得してIDマッピングを返す
   * @returns トラッカーの名前とIDのマッピング配列
   */
  async getTrackers(): Promise<NameIdMapping[]> {
    if (this.trackersCache) {
      return this.trackersCache;
    }

    interface TrackersResponse {
      trackers: Array<{
        id: number;
        name: string;
      }>;
    }

    const response = await this.request<TrackersResponse>('trackers.json');
    this.trackersCache = response.trackers.map((tracker) => ({
      id: tracker.id,
      name: tracker.name,
    }));

    return this.trackersCache;
  }

  /**
   * ステータス一覧を取得してIDマッピングを返す
   * @returns ステータスの名前とIDのマッピング配列
   */
  async getStatuses(): Promise<NameIdMapping[]> {
    if (this.statusesCache) {
      return this.statusesCache;
    }

    interface StatusesResponse {
      issue_statuses: Array<{
        id: number;
        name: string;
      }>;
    }

    const response = await this.request<StatusesResponse>(
      'issue_statuses.json',
    );
    this.statusesCache = response.issue_statuses.map((status) => ({
      id: status.id,
      name: status.name,
    }));

    return this.statusesCache;
  }

  /**
   * 優先度一覧を取得してIDマッピングを返す
   * @returns 優先度の名前とIDのマッピング配列
   */
  async getPriorities(): Promise<NameIdMapping[]> {
    if (this.prioritiesCache) {
      return this.prioritiesCache;
    }

    interface PrioritiesResponse {
      issue_priorities: Array<{
        id: number;
        name: string;
      }>;
    }

    const response = await this.request<PrioritiesResponse>(
      'enumerations/issue_priorities.json',
    );
    this.prioritiesCache = response.issue_priorities.map((priority) => ({
      id: priority.id,
      name: priority.name,
    }));

    return this.prioritiesCache;
  }

  /**
   * プロジェクトのスプリント一覧を取得してIDマッピングを返す
   * @param projectId プロジェクトID
   * @returns スプリントの名前とIDのマッピング配列
   */
  async getSprints(projectId: number): Promise<NameIdMapping[]> {
    if (this.sprintsCache) {
      return this.sprintsCache;
    }

    // Scrumプラグインからスプリント情報を取得
    // 注意: このエンドポイントはプラグインに依存し、RedmineインスタンスとScrumプラグインのバージョンによって異なる場合がある
    const response = await this.request<any>(
      `projects/${projectId}/sprints.json`,
    );

    if (response.sprints) {
      this.sprintsCache = response.sprints.map((sprint: any) => ({
        id: sprint.id,
        name: sprint.name,
      }));
    } else {
      // スプリントがない場合は空配列を返す
      this.sprintsCache = [];
    }

    return this.sprintsCache;
  }

  /**
   * 指定したプロジェクトのバージョン一覧を取得
   * @param projectId プロジェクトID
   * @returns バージョンの名前とIDのマッピング配列
   */
  async getVersions(projectId: number): Promise<NameIdMapping[]> {
    interface VersionsResponse {
      versions: Array<{
        id: number;
        name: string;
      }>;
    }

    const response = await this.request<VersionsResponse>(
      `projects/${projectId}/versions.json`,
    );
    return response.versions.map((version) => ({
      id: version.id,
      name: version.name,
    }));
  }

  /**
   * カスタムフィールド定義一覧を取得
   * @returns カスタムフィールドの定義情報
   */
  async getCustomFields(): Promise<any[]> {
    interface CustomFieldsResponse {
      custom_fields: Array<{
        id: number;
        name: string;
        customized_type: string;
        field_format: string;
        possible_values?: string[];
      }>;
    }

    const response =
      await this.request<CustomFieldsResponse>('custom_fields.json');
    return response.custom_fields;
  }
}

/**
 * RedmineClientのfactory関数
 * @param config RedmineClientの設定
 * @returns RedmineClientのインスタンス
 */
export const createRedmineClient = (
  config: RedmineClientConfig,
): RedmineClient => {
  return new RedmineClient(config);
};

/**
 * RedmineClient設定のZodスキーマ
 */
export const redmineClientConfigSchema = z.object({
  apiUrl: z.string().url('有効なRedmine APIのURLを入力してください'),
  apiKey: z.string().min(1, 'RedmineのAPIキーを入力してください'),
});
