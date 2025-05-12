/**
 * RedmineClient
 * Redmine APIとの通信を行うクライアントクラス
 */

import { z } from 'zod';
import { RedmineProject, RedmineBaseInfo } from './types';
import { RedmineSchema } from '../../../main/types/settingsSchema';

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
  private projectsCache: RedmineProject[] = [];

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
   * Redmine の REST API リクエストメソッド
   *  - GET  の場合 : limit / offset を使って全件取得（最大 100 件ずつ）
   *  - POST/PUT の場合 : 1 回だけ実行
   */
  async request<T = any>(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    data: any = undefined,
  ): Promise<T> {
    /**
     * --------------------------
     *  共通ヘッダーと fetch オプション
     * --------------------------
     */
    const commonHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Redmine-API-Key': this.apiKey,
    };

    /**
     * ---------------------------------------------
     * 1. GET 以外は従来どおり 1 回だけ実行して終了
     * ---------------------------------------------
     */
    if (method !== 'GET') {
      const url = new URL(path, this.apiUrl);
      const response = await fetch(url.toString(), {
        method,
        headers: commonHeaders,
        body: data ? JSON.stringify(data) : undefined,
      });
      if (!response.ok) {
        throw new Error(
          `Redmine API Error: ${response.status} ${response.statusText}`,
        );
      }
      if (response.status === 204) {
        return {} as T;
      }
      return (await response.json()) as T;
    }

    /**
     * ---------------------------------------
     * 2. ここから GET（一覧取得）のページネーション処理
     * ---------------------------------------
     */
    const limit = 100; // 1 リクエスト最大件数（Redmine の上限）
    let offset = 0; // 現在の取得開始位置
    let aggregatedJson: any = null; // マージ後に返却する JSON
    let arrayKey: string | null = null; // projects / issues / users など配列が入るキー

    while (true) {
      // URL に limit / offset を付与（既に付いていれば上書き）
      const url = new URL(path, this.apiUrl);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', offset.toString());

      // リクエスト実行
      const res = await fetch(url.toString(), {
        method,
        headers: commonHeaders,
      });
      if (!res.ok) {
        throw new Error(`Redmine API Error: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as Record<string, any>;

      /**
       * 2-1. 1 ページ目：返却 JSON の「配列キー」と total_count を特定
       *  - Redmine の一覧 API は必ず
       *       {
       *         "<resource_plural>": [...array...],
       *         "total_count": 123,
       *         "limit": 100,
       *         "offset": 0
       *       }
       *    の形で返る。
       */
      if (arrayKey === null) {
        arrayKey =
          Object.keys(json).find((k) => Array.isArray(json[k])) || null;
        if (!arrayKey) {
          // 配列キーが見つからない ⇒ そもそも一覧 API ではない
          return json as T;
        }
        // 返却用オブジェクトのひな形を作成（total_count 等も保持）
        aggregatedJson = { ...json, [arrayKey]: [...json[arrayKey]] };
      } else {
        // 2 ページ目以降は対象配列だけマージ
        aggregatedJson[arrayKey].push(...json[arrayKey]);
      }

      // 現在取得済み件数
      const currentCount: number = aggregatedJson[arrayKey].length;
      const total: number | undefined = aggregatedJson.total_count; // 無いエンドポイントもある

      // ---------------------------------
      // ループ終了判定
      //   1) total_count がある     → 取得済 >= total_count
      //   2) total_count が無い場合 → 返却件数 < limit（＝最終ページ）
      // ---------------------------------
      if (
        (total !== undefined && currentCount >= total) ||
        json[arrayKey].length < limit
      ) {
        break;
      }

      offset += limit; // 次ページへ
    }

    return aggregatedJson as T;
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
    mappings: (NameIdMapping | RedmineProject)[],
  ): Promise<number> {
    // 既にIDなら変換不要
    if (typeof value === 'number') {
      return value;
    }

    // 文字列が数値表現なら変換
    if (!Number.isNaN(Number(value))) {
      return Number(value);
    }

    // 名前またはidentifierからIDを検索
    const found = mappings.find((item) => {
      const lowercaseValue = value.toLowerCase();
      const nameMatch = item.name.toLowerCase() === lowercaseValue;
      const identifierMatch =
        'identifier' in item &&
        item.identifier.toLowerCase() === lowercaseValue;
      return nameMatch || identifierMatch;
    });
    if (found) {
      return found.id;
    }

    throw new Error(`Unable to resolve ID for: ${value}`);
  }

  /**
   * キャッシュされた基本情報を一括で取得する
   */
  async getBaseInfo(): Promise<RedmineBaseInfo> {
    const trackers = await this.getTrackers();
    const statuses = await this.getStatuses();
    const priorities = await this.getPriorities();

    return {
      trackers,
      statuses,
      priorities,
    };
  }

  /**
   * プロジェクト一覧を取得してIDマッピングを返す
   * @returns プロジェクトの名前とIDのマッピング配列
   */
  async getProjects(): Promise<RedmineProject[]> {
    if (this.projectsCache.length > 0) {
      return this.projectsCache;
    }

    interface ProjectsResponse {
      projects: Array<{
        id: number;
        name: string;
        identifier: string;
      }>;
    }

    const response = await this.request<ProjectsResponse>(
      'projects.json',
      'GET',
    );
    this.projectsCache = response.projects.map((project) => ({
      id: project.id,
      name: project.name,
      identifier: project.identifier,
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
      throw error;
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
  // settingsSchemaによる設定値の検証
  const validationResult = RedmineSchema.safeParse({
    endpoint: config.apiUrl,
    apiKey: config.apiKey,
  });
  if (!validationResult.success) {
    throw new Error(`Redmine設定が不正です: ${validationResult.error.message}`);
  }
  return new RedmineClient(config);
};

/**
 * RedmineClient設定のZodスキーマ
 */
export const redmineClientConfigSchema = z.object({
  apiUrl: z.string().url('有効なRedmine APIのURLを入力してください'),
  apiKey: z.string().min(1, 'RedmineのAPIキーを入力してください'),
});
