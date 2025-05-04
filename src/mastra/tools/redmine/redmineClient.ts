/**
 * RedmineClient
 * Redmine APIとの通信を行うクライアントクラス
 */

import { z } from 'zod';

type RedmineHeaders = Record<string, string>;

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

  // キャッシュ: プロジェクト、トラッカー、ステータスなど
  private projectsCache: NameIdMapping[] = [];

  private trackersCache: NameIdMapping[] = [];

  private statusesCache: NameIdMapping[] = [];

  private prioritiesCache: NameIdMapping[] = [];

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
  async request<T = any>(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    data: any = undefined,
  ): Promise<T> {
    const url = new URL(path, this.apiUrl);

    const headers: RedmineHeaders = {
      'Content-Type': 'application/json',
      'X-Redmine-API-Key': this.apiKey,
    };

    const options = {
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

      // 更新処理（PUT）の場合、204ステータスかつコンテンツが返らないため空オブジェクトを返す
      if (
        response.status === 204 ||
        !response.headers.get('content-length') ||
        response.headers.get('transfer-encoding')?.includes('chunked')
      ) {
        return {} as T;
      }

      return await response.json();
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
  // eslint-disable-next-line
  async resolveId(
    value: number | string,
    mappings: NameIdMapping[],
  ): Promise<number> {
    // 既にIDなら変換不要
    if (typeof value === 'number') {
      return value;
    }

    // 文字列が数値表現なら変換
    if (!Number.isNaN(Number(value))) {
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
    if (this.projectsCache.length > 0) {
      return this.projectsCache;
    }

    interface ProjectsResponse {
      projects: Array<{
        id: number;
        name: string;
      }>;
    }

    const response = await this.request<ProjectsResponse>(
      'projects.json',
      'GET',
    );
    this.projectsCache = response.projects.map((project) => ({
      id: project.id,
      name: project.name,
    }));

    return this.projectsCache;
  }

  /**
   * トラッカー一覧を取得してIDマッピングを返す
   * @returns トラッカーの名前とIDのマッピング配列
   */
  async getTrackers(): Promise<NameIdMapping[]> {
    if (this.trackersCache.length > 0) {
      return this.trackersCache;
    }

    interface TrackersResponse {
      trackers: Array<{
        id: number;
        name: string;
      }>;
    }

    const response = await this.request<TrackersResponse>(
      'trackers.json',
      'GET',
    );
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
    if (this.statusesCache.length > 0) {
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
      'GET',
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
    if (this.prioritiesCache.length > 0) {
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
      'GET',
    );
    this.prioritiesCache = response.issue_priorities.map((priority) => ({
      id: priority.id,
      name: priority.name,
    }));

    return this.prioritiesCache;
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
      'GET',
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

    const response = await this.request<CustomFieldsResponse>(
      'custom_fields.json',
      'GET',
    );
    return response.custom_fields;
  }

  /**
   * Redmine APIとの疎通確認を行う
   * @returns APIアクセスに成功した場合はtrue
   * @throws APIアクセスに失敗した場合はエラー
   */
  async testConnection(): Promise<boolean> {
    try {
      // 最も基本的なAPIを呼び出し
      await this.request('issues.json?limit=1', 'GET');
      return true;
    } catch (error) {
      console.error('Redmine API疎通確認に失敗:', error);
      throw new Error('Redmine APIへの接続に失敗しました');
    }
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
