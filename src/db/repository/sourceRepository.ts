import { eq, inArray, and } from 'drizzle-orm';
import getDb from '..';
import type { Source, InsertSource, InsertTopic } from '../schema';
import { sources, topics } from '../schema';
import { ProcessStatus } from '@/types';

export interface SourceRepository {
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
}

let sourceRepository: SourceRepository | null = null;

class DrizzleSourceRepository implements SourceRepository {
  async getSourceById(sourceId: number): Promise<Source | null> {
    const db = await getDb();
    const [source] = await db
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1);
    return source || null;
  }

  async getSourcesByIds(sourceIds: number[]): Promise<Source[]> {
    const db = await getDb();
    return db.select().from(sources).where(inArray(sources.id, sourceIds));
  }

  /**
   * ソースを更新する
   * @param param ソース情報
   * @param param.path ソースのパス
   * @param param.title ソースのタイトル
   * @param param.summary ソースの要約
   * @param param.error エラー情報（nullの場合はエラーなし）
   * @returns
   */
  async updateSource(param: {
    id: number;
    title: string;
    summary: string;
    error: string | null;
  }): Promise<void> {
    const db = await getDb();
    await db
      .update(sources)
      .set({
        title: param.title,
        summary: param.summary,
        error: param.error,
      })
      .where(eq(sources.id, param.id));
  }

  /**
   * 同期処理中のソースを登録または更新する
   * @param source 登録または更新するソース情報
   * @returns 登録または更新されたソース情報
   */
  async initializeProcessingSource(source: InsertSource): Promise<Source> {
    const db = await getDb();
    const [result] = await db
      .insert(sources)
      .values({
        path: source.path,
        title: '', // 一時的な空の値
        summary: '', // 一時的な空の値
        status: 'processing' as const,
      })
      .onConflictDoUpdate({
        target: sources.path,
        set: {
          status: 'processing' as const,
          error: null,
        },
      })
      .returning();
    return result;
  }

  /**
   * データベースからソース情報を取得する
   */
  async getSourceListMarkdown(): Promise<string | null> {
    const db = await getDb();
    // 有効なソースのみ取得
    const sourceList = await db
      .select()
      .from(sources)
      .where(and(eq(sources.isEnabled, 1), eq(sources.status, 'completed')))
      .orderBy(sources.title);

    // 各ソースのトピックを取得
    const sourceWithTopicList = await Promise.all(
      sourceList.map(async (source) => {
        const topicsList = await db
          .select()
          .from(topics)
          .where(eq(topics.sourceId, source.id))
          .orderBy(topics.name);

        return {
          id: source.id,
          title: source.title,
          path: source.path,
          summary: source.summary,
          topics: topicsList.map((topic) => ({
            name: topic.name,
            summary: topic.summary,
          })),
        };
      }),
    );

    if (sourceWithTopicList.length === 0) {
      return null; // ソースが存在しない場合はnullを返す
    }

    return sourceWithTopicList
      .map(
        (sourceWithTopic) => `- ID:${sourceWithTopic.id}
      - Title:${sourceWithTopic.title}
      - Path:${sourceWithTopic.path}
      - Summary:${sourceWithTopic.summary}
      - Topics:
    ${sourceWithTopic.topics.map((topic) => `      - Topic: ${topic.name} Summary: ${topic.summary}`).join('\n')}
  `,
      )
      .join('\n');
  }

  async updateProcessingStatus(param: {
    id: number;
    status: ProcessStatus;
    error?: string | null;
  }): Promise<void> {
    const db = await getDb();
    await db
      .update(sources)
      .set({
        status: param.status,
        error: param.error || null,
      })
      .where(eq(sources.id, param.id));
  }

  /**
   * トピックを登録する
   * @param topic 登録するトピック情報
   * @returns 登録されたトピック情報
   */
  async registerTopic(topicList: InsertTopic[]): Promise<void> {
    const db = await getDb();
    await db.insert(topics).values(topicList);
  }

  async deleteSourceByPath(path: string): Promise<boolean> {
    const db = await getDb();
    const [source] = await db
      .select()
      .from(sources)
      .where(eq(sources.path, path))
      .limit(1);

    if (source) {
      await db.delete(sources).where(eq(sources.id, source.id));
      await db.delete(topics).where(eq(topics.sourceId, source.id));
    }
    return !!source; // 存在した場合はtrue、存在しなかった場合はfalseを返す
  }

  async getSouorceInStatus(status: ProcessStatus[]): Promise<Source[]> {
    const db = await getDb();
    return db.select().from(sources).where(inArray(sources.status, status));
  }

  async getSourceByPathInStatus(
    path: string,
    status: ProcessStatus[],
  ): Promise<Source[]> {
    const db = await getDb();
    const sourcesInStatus = await db
      .select()
      .from(sources)
      .where(and(eq(sources.path, path), inArray(sources.status, status)));

    return sourcesInStatus;
  }

  async getAllSources(): Promise<Source[]> {
    const db = await getDb();
    return db.select().from(sources);
  }

  async insertSources(sourceList: InsertSource[]): Promise<void> {
    const db = await getDb();
    await db.insert(sources).values(sourceList);
  }
}

export function getSourceRepository(): SourceRepository {
  if (!sourceRepository) {
    sourceRepository = new DrizzleSourceRepository();
  }
  return sourceRepository;
}
