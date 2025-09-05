import { eq, and } from 'drizzle-orm';
import path from 'path';
import type {
  ReviewHistory,
  ReviewChecklist,
  ReviewChecklistResult as DBReviewChecklistResult,
} from '../schema';
import {
  reviewHistories,
  reviewChecklists,
  reviewChecklistResults,
} from '../schema';
import getDb from '..';
import type {
  ReviewChecklistResultDisplay,
  ReviewEvaluation,
  ReviewChecklistCreatedBy,
} from '@/types';
import { RepositoryError } from './repositoryError';

/**
 * ドキュメントレビューで利用するDBアクセス用のインターフェース
 */
export interface ReviewRepository {
  // レビュー履歴
  createReviewHistory(title: string, id?: string): Promise<ReviewHistory>;
  getReviewHistory(id: string): Promise<ReviewHistory | null>;
  getAllReviewHistories(): Promise<ReviewHistory[]>;
  updateReviewHistoryTitle(id: string, title: string): Promise<void>;
  updateReviewHistoryAdditionalData(
    id: string,
    additionalInstructions?: string,
    commentFormat?: string,
  ): Promise<void>;
  deleteReviewHistory(id: string): Promise<void>;

  // チェックリスト
  createChecklist(
    reviewHistoryId: string,
    content: string,
    createdBy: ReviewChecklistCreatedBy,
  ): Promise<ReviewChecklist>;
  getChecklists(reviewHistoryId: string): Promise<ReviewChecklist[]>;
  updateChecklist(id: number, content: string): Promise<ReviewChecklist>;
  deleteChecklist(id: number): Promise<void>;
  deleteSystemCreatedChecklists(reviewHistoryId: string): Promise<void>;

  // レビュー結果
  upsertReviewResult(
    results: {
      reviewChecklistId: number;
      evaluation: ReviewEvaluation;
      comment: string;
      fileId: string;
      fileName: string;
    }[],
  ): Promise<DBReviewChecklistResult[]>;
  getReviewResults(
    reviewChecklistId: number,
  ): Promise<DBReviewChecklistResult[]>;
  deleteReviewResults(
    reviewChecklistId: number,
    sourceId: number,
  ): Promise<void>;
  getReviewChecklistResults(
    reviewHistoryId: string,
  ): Promise<ReviewChecklistResultDisplay[]>;
  deleteAllReviewResults(reviewHistoryId: string): Promise<void>;
}

let reviewRepository: ReviewRepository | null = null;

/**
 * Drizzle ORM を使用したレビューリポジトリの実装
 */
class DrizzleReviewRepository implements ReviewRepository {
  /** レビュー履歴を作成 */
  async createReviewHistory(
    title: string,
    id?: string,
  ): Promise<ReviewHistory> {
    try {
      const db = await getDb();
      const [history] = await db
        .insert(reviewHistories)
        .values({ title, id })
        .returning();
      return history;
    } catch (err) {
      throw new RepositoryError(
        `レビュー履歴の作成に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** レビュー履歴を取得（存在しない場合は null） */
  async getReviewHistory(id: string): Promise<ReviewHistory | null> {
    try {
      const db = await getDb();
      const [history] = await db
        .select()
        .from(reviewHistories)
        .where(eq(reviewHistories.id, id));
      return history || null;
    } catch (err) {
      throw new RepositoryError(
        `レビュー履歴の取得に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** 全レビュー履歴を取得 */
  async getAllReviewHistories(): Promise<ReviewHistory[]> {
    try {
      const db = await getDb();
      return await db
        .select()
        .from(reviewHistories)
        .orderBy(reviewHistories.updatedAt);
    } catch (err) {
      throw new RepositoryError(
        `レビュー履歴一覧の取得に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** レビュー履歴タイトルを更新 */
  async updateReviewHistoryTitle(id: string, title: string): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(reviewHistories)
        .set({ title })
        .where(eq(reviewHistories.id, id));
    } catch (err) {
      throw new RepositoryError(
        `レビュー履歴の更新に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** レビュー履歴の追加データを更新 */
  async updateReviewHistoryAdditionalData(
    id: string,
    additionalInstructions?: string,
    commentFormat?: string,
  ): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(reviewHistories)
        .set({
          additionalInstructions,
          commentFormat,
        })
        .where(eq(reviewHistories.id, id));
    } catch (err) {
      throw new RepositoryError(
        `レビュー履歴の追加データ更新に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** レビュー履歴を削除 */
  async deleteReviewHistory(id: string): Promise<void> {
    try {
      const db = await getDb();
      await db.delete(reviewHistories).where(eq(reviewHistories.id, id));
    } catch (err) {
      throw new RepositoryError(
        `レビュー履歴の削除に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** チェックリストを作成 */
  async createChecklist(
    reviewHistoryId: string,
    content: string,
    createdBy: ReviewChecklistCreatedBy,
  ): Promise<ReviewChecklist> {
    try {
      const db = await getDb();
      const [checklist] = await db
        .insert(reviewChecklists)
        .values({ reviewHistoryId, content, createdBy })
        .returning();
      return checklist;
    } catch (err) {
      throw new RepositoryError(
        `チェックリストの作成に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** チェックリスト一覧を取得 */
  async getChecklists(reviewHistoryId: string): Promise<ReviewChecklist[]> {
    try {
      const db = await getDb();
      return await db
        .select()
        .from(reviewChecklists)
        .where(eq(reviewChecklists.reviewHistoryId, reviewHistoryId))
        .orderBy(reviewChecklists.updatedAt);
    } catch (err) {
      throw new RepositoryError(
        `チェックリストの取得に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** チェックリストを更新 */
  async updateChecklist(id: number, content: string): Promise<ReviewChecklist> {
    try {
      const db = await getDb();
      const [checklist] = await db
        .update(reviewChecklists)
        .set({ content })
        .where(eq(reviewChecklists.id, id))
        .returning();
      if (!checklist) {
        throw new RepositoryError(`チェックリストID ${id} が見つかりません`);
      }
      return checklist;
    } catch (err) {
      if (err instanceof RepositoryError) throw err;
      throw new RepositoryError(
        `チェックリストの更新に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** チェックリストを削除 */
  async deleteChecklist(id: number): Promise<void> {
    try {
      const db = await getDb();
      await db.delete(reviewChecklists).where(eq(reviewChecklists.id, id));
    } catch (err) {
      throw new RepositoryError(
        `チェックリストの削除に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** システム作成チェックリストを削除 */
  async deleteSystemCreatedChecklists(reviewHistoryId: string): Promise<void> {
    try {
      const db = await getDb();
      await db
        .delete(reviewChecklists)
        .where(
          and(
            eq(reviewChecklists.reviewHistoryId, reviewHistoryId),
            eq(reviewChecklists.createdBy, 'system'),
          ),
        );
    } catch (err) {
      throw new RepositoryError(
        `システム作成チェックリストの削除に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** レビュー結果を作成 */
  async upsertReviewResult(
    results: {
      reviewChecklistId: number;
      evaluation: ReviewEvaluation;
      comment: string;
      fileId: string;
      fileName: string;
    }[],
  ): Promise<DBReviewChecklistResult[]> {
    try {
      const db = await getDb();
      const upsertedResults: DBReviewChecklistResult[] = [];
      for (const result of results) {
        const [upserted] = await db
          .insert(reviewChecklistResults)
          .values(result)
          .onConflictDoUpdate({
            target: [
              reviewChecklistResults.reviewChecklistId,
              reviewChecklistResults.fileId,
            ],
            set: {
              evaluation: result.evaluation,
              comment: result.comment,
            },
          })
          .returning();
        upsertedResults.push(upserted);
      }
      return upsertedResults;
    } catch (err) {
      throw new RepositoryError(
        `レビュー結果の作成に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** レビュー結果一覧を取得 */
  async getReviewResults(
    reviewChecklistId: number,
  ): Promise<DBReviewChecklistResult[]> {
    try {
      const db = await getDb();
      return await db
        .select()
        .from(reviewChecklistResults)
        .where(eq(reviewChecklistResults.reviewChecklistId, reviewChecklistId));
    } catch (err) {
      throw new RepositoryError(
        `レビュー結果の取得に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** レビュー結果を削除 */
  async deleteReviewResults(
    reviewChecklistId: number,
    sourceId: number,
  ): Promise<void> {
    try {
      const db = await getDb();
      await db
        .delete(reviewChecklistResults)
        .where(
          and(
            eq(reviewChecklistResults.reviewChecklistId, reviewChecklistId),
            eq(reviewChecklistResults.fileId, sourceId.toString()),
          ),
        );
    } catch (err) {
      throw new RepositoryError(
        `レビュー結果の削除に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** チェックリスト結果を取得してグルーピング */
  async getReviewChecklistResults(
    reviewHistoryId: string,
  ): Promise<ReviewChecklistResultDisplay[]> {
    try {
      const db = await getDb();
      const rows = await db
        .select({
          checklistId: reviewChecklists.id,
          content: reviewChecklists.content,
          fileId: reviewChecklistResults.fileId,
          fileName: reviewChecklistResults.fileName,
          evaluation: reviewChecklistResults.evaluation,
          comment: reviewChecklistResults.comment,
        })
        .from(reviewChecklists)
        .leftJoin(
          reviewChecklistResults,
          eq(reviewChecklistResults.reviewChecklistId, reviewChecklists.id),
        )
        .where(eq(reviewChecklists.reviewHistoryId, reviewHistoryId))
        .orderBy(reviewChecklists.createdAt);

      const map = new Map<number, ReviewChecklistResultDisplay>();
      for (const row of rows) {
        let group = map.get(row.checklistId);
        if (!group) {
          group = {
            id: row.checklistId,
            content: row.content,
            sourceEvaluations: [],
          };
          map.set(row.checklistId, group);
        }
        if (row.fileId !== null && row.fileName !== null) {
          group.sourceEvaluations!.push({
            fileId: row.fileId,
            fileName: row.fileName,
            evaluation: row.evaluation as ReviewEvaluation,
            comment: row.comment ?? undefined,
          });
        }
      }
      return Array.from(map.values());
    } catch (err) {
      throw new RepositoryError(
        `チェックリスト結果の取得に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }

  /** すべてのレビュー結果を削除 */
  async deleteAllReviewResults(reviewHistoryId: string): Promise<void> {
    try {
      const db = await getDb();
      const checklists = await db
        .select({ id: reviewChecklists.id })
        .from(reviewChecklists)
        .where(eq(reviewChecklists.reviewHistoryId, reviewHistoryId));

      // チェックリストが無ければ何もしない
      if (checklists.length === 0) return;

      for (const { id } of checklists) {
        await db
          .delete(reviewChecklistResults)
          .where(eq(reviewChecklistResults.reviewChecklistId, id));
      }
    } catch (err) {
      throw new RepositoryError(
        `レビュー結果の全削除に失敗しました: ${(err as Error).message}`,
        err as Error,
      );
    }
  }
}

/**
 * ドキュメントレビュー用のリポジトリを取得
 * @returns ReviewRepositoryのインスタンス
 */
export function getReviewRepository(): ReviewRepository {
  if (!reviewRepository) {
    reviewRepository = new DrizzleReviewRepository();
  }
  return reviewRepository;
}
