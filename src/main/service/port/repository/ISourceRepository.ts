import { ProcessStatus, Source, Topic } from '@/types';

export type InsertSource = Omit<
  Source,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'error' | 'isEnabled'
> &
  Partial<Pick<Source, 'status' | 'error' | 'isEnabled'>>;

export type InsertTopic = Omit<Topic, 'id' | 'createdAt' | 'updatedAt'>;

export interface ISourceRepository {
  /**
   * ソースを取得する
   * @param sourceId ソースのID
   * @returns ソース情報
   */
  getSourceById(sourceId: number): Promise<Source | null>;

  /**
   * idで指定された複数ソース取得する
   * @returns ソースの配列
   */
  getSourcesByIds(sourceIds: number[]): Promise<Source[]>;

  /**
   * 同期処理中のソースを登録または更新する
   * @param source 登録または更新するソース情報
   * @returns 登録または更新されたソース情報
   */
  initializeProcessingSource(source: InsertSource): Promise<Source>;

  /**
   * ソース情報を更新する
   * @param param 更新するソース情報
   * @param param.id ソースのID
   * @param param.title ソースのタイトル
   * @param param.summary ソースの要約
   * @param param.error エラー情報（nullの場合はエラーなし）
   * @returns 更新されたソース情報
   */
  updateSource(param: {
    id: number;
    title: string;
    summary: string;
    error: string | null;
  }): Promise<void>;

  /**
   * 同期処理情報を更新する
   */
  updateProcessingStatus(param: {
    id: number;
    status: ProcessStatus;
    error?: string | null;
  }): Promise<void>;

  /**
   * 全ソースの情報をMDのリスト形式で取得する
   * @param sourceId ソースのID
   * @returns ソース情報
   */
  getSourceListMarkdown(): Promise<string | null>;

  /**
   * トピックを登録する
   */
  registerTopic(topicList: InsertTopic[]): Promise<void>;

  /**
   * パスで指定されたソースを削除する
   * @param path ソースのパス
   * @returns 削除が成功した場合はtrue、存在しない場合はfalse
   */
  deleteSourceByPath(path: string): Promise<boolean>;

  /**
   * ソースをステータスに基づいて複数取得する
   * @param status ソースのステータス
   * @returns ソースの配列
   */
  getSouorceInStatus(status: ProcessStatus[]): Promise<Source[]>;

  /**
   * ソースをステータスとパスに基づいて複数取得する
   */
  getSourceByPathInStatus(
    path: string,
    status: ProcessStatus[],
  ): Promise<Source[]>;

  /**
   * ソースを全て取得する
   */
  getAllSources(): Promise<Source[]>;

  /**
   * ソーステーブルへのインサート
   */
  insertSources(sourceList: InsertSource[]): Promise<void>;

  /**
   * ソースの有効/無効を更新する
   * @param sourceId ソースID
   * @param enabled 有効/無効
   */
  updateSourceEnabled(sourceId: number, enabled: boolean): Promise<void>;
}
