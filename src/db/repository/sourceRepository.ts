import { eq, inArray } from 'drizzle-orm';
import getDb from '..';
import type { Source } from '../schema';
import { sources } from '../schema';

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
}

export function getSourceRepository(): SourceRepository {
  if (!sourceRepository) {
    sourceRepository = new DrizzleSourceRepository();
  }
  return sourceRepository;
}
