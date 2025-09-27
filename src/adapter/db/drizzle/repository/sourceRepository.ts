import { eq, inArray, and } from 'drizzle-orm';
import getDb from '..';
import type { SourceEntity } from '../schema';
import { sources, topics } from '../schema';
import { Source, ProcessStatus } from '@/types';
import { repositoryError } from '@/main/lib/error';
import { ISourceRepository, InsertSource, InsertTopic } from '@/main/service/port';

export class DrizzleSourceRepository implements ISourceRepository {
  convertSourceEntityToSource(entity: SourceEntity): Source {
    return {
      id: entity.id,
      path: entity.path,
      title: entity.title,
      summary: entity.summary,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      status: entity.status,
      error: entity.error,
      isEnabled: entity.isEnabled === 1,
    };
  }

  async getSourceById(sourceId: number): Promise<Source | null> {
    try {
      const db = await getDb();
      const [source] = await db
        .select()
        .from(sources)
        .where(eq(sources.id, sourceId))
        .limit(1);
      if (!source) {
        throw Error('指定されたIDのソースが存在しません');
      }
      return this.convertSourceEntityToSource(source);
    } catch (err) {
      throw repositoryError('ドキュメント情報の取得に失敗しました', err);
    }
  }

  async getSourcesByIds(sourceIds: number[]): Promise<Source[]> {
    try {
      const db = await getDb();
      const sourceEntities =  await db.select().from(sources).where(inArray(sources.id, sourceIds));
      return sourceEntities.map((entity) => this.convertSourceEntityToSource(entity));
    } catch (err) {
      throw repositoryError('ドキュメント情報の取得に失敗しました', err);
    }
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
    try {
      const db = await getDb();
      await db
        .update(sources)
        .set({
          title: param.title,
          summary: param.summary,
          error: param.error,
        })
        .where(eq(sources.id, param.id));
    } catch (err) {
      throw repositoryError('ドキュメント情報の更新に失敗しました', err);
    }
  }

  /**
   * 同期処理中のソースを登録または更新する
   * @param source 登録または更新するソース情報
   * @returns 登録または更新されたソース情報
   */
  async initializeProcessingSource(source: InsertSource): Promise<Source> {
    try {
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
      return this.convertSourceEntityToSource(result);
    } catch (err) {
      throw repositoryError('ドキュメント情報の更新に失敗しました', err);
    }
  }

  /**
   * データベースからソース情報を取得する
   */
  async getSourceListMarkdown(): Promise<string | null> {
    try {
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
    } catch (err) {
      throw repositoryError('ドキュメント情報の取得に失敗しました', err);
    }
  }

  async updateProcessingStatus(param: {
    id: number;
    status: ProcessStatus;
    error?: string | null;
  }): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(sources)
        .set({
          status: param.status,
          error: param.error || null,
        })
        .where(eq(sources.id, param.id));
    } catch (err) {
      throw repositoryError('ドキュメント情報の更新に失敗しました', err);
    }
  }

  /**
   * トピックを登録する
   * @param topic 登録するトピック情報
   * @returns 登録されたトピック情報
   */
  async registerTopic(topicList: InsertTopic[]): Promise<void> {
    try {
      const db = await getDb();
      await db.insert(topics).values(topicList);
    } catch (err) {
      throw repositoryError('ドキュメント情報の更新に失敗しました', err);
    }
  }

  async deleteSourceByPath(path: string): Promise<boolean> {
    try {
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
    } catch (err) {
      throw repositoryError('ドキュメント情報の削除に失敗しました', err);
    }
  }

  async getSouorceInStatus(status: ProcessStatus[]): Promise<Source[]> {
    try {
      const db = await getDb();
      const sourceEntities = await db.select().from(sources).where(inArray(sources.status, status));
      return sourceEntities.map((entity) => this.convertSourceEntityToSource(entity));
    } catch (err) {
      throw repositoryError('ドキュメント情報の取得に失敗しました', err);
    }
  }

  async getSourceByPathInStatus(
    path: string,
    status: ProcessStatus[],
  ): Promise<Source[]> {
    try {
      const db = await getDb();
      const sourcesInStatus = await db
        .select()
        .from(sources)
        .where(and(eq(sources.path, path), inArray(sources.status, status)));
      return sourcesInStatus.map((entity) => this.convertSourceEntityToSource(entity));
    } catch (err) {
      throw repositoryError('ドキュメント情報の取得に失敗しました', err);
    }
  }

  async getAllSources(): Promise<Source[]> {
    try {
      const db = await getDb();
      const sourceEntities = await db.select().from(sources);
      return sourceEntities.map((entity) => this.convertSourceEntityToSource(entity));
    } catch (err) {
      throw repositoryError('ドキュメント情報の取得に失敗しました', err);
    }
  }

  async insertSources(sourceList: InsertSource[]): Promise<void> {
    try {
      const db = await getDb();
      const insertSourceEntities = sourceList.map((source) => ({
        ...source,
        isEnabled: source.isEnabled ? 1 : 0,
      }));
      await db.insert(sources).values(insertSourceEntities);
    } catch (err) {
      throw repositoryError('ドキュメント情報の作成に失敗しました', err);
    }
  }

  async updateSourceEnabled(sourceId: number, enabled: boolean): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(sources)
        .set({ isEnabled: enabled ? 1 : 0 })
        .where(eq(sources.id, sourceId));
    } catch (err) {
      throw repositoryError('ドキュメント情報の更新に失敗しました', err);
    }
  }
}
