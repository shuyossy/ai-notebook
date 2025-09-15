import { eq, and } from 'drizzle-orm';
import {
  reviewHistories,
  reviewChecklists,
  reviewChecklistResults,
  ReviewChecklistEntity,
  ReviewHistoryEntity,
} from '../../db/schema';
import getDb from '../../db';
import type {
  RevieHistory,
  ReviewChecklist,
  ReviewChecklistResult,
  ReviewEvaluation,
  ReviewChecklistCreatedBy,
  CustomEvaluationSettings,
} from '@/types';
import { AppError } from '@/main/lib/error';
import { repositoryError } from './error';

/**
 * ドキュメントレビューで利用するDBアクセス用のインターフェース
 */
export interface IReviewRepository {
  // レビュー履歴
  createReviewHistory(title: string, id?: string): Promise<RevieHistory>;
  getReviewHistory(id: string): Promise<RevieHistory | null>;
  getAllReviewHistories(): Promise<RevieHistory[]>;
  updateReviewHistoryTitle(id: string, title: string): Promise<void>;
  updateReviewHistoryAdditionalInstructionsAndCommentFormat(
    id: string,
    additionalInstructions?: string,
    commentFormat?: string,
  ): Promise<void>;
  updateReviewHistoryEvaluationSettings(
    id: string,
    evaluationSettings?: CustomEvaluationSettings,
  ): Promise<void>;
  deleteReviewHistory(id: string): Promise<void>;

  // チェックリスト
  createChecklist(
    reviewHistoryId: string,
    content: string,
    createdBy: ReviewChecklistCreatedBy,
  ): Promise<void>;
  getChecklists(reviewHistoryId: string): Promise<ReviewChecklist[]>;
  updateChecklist(id: number, content: string): Promise<void>;
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
  ): Promise<void>;
  deleteReviewResults(
    reviewChecklistId: number,
    sourceId: number,
  ): Promise<void>;
  getReviewChecklistResults(
    reviewHistoryId: string,
  ): Promise<ReviewChecklistResult[]>;
  deleteAllReviewResults(reviewHistoryId: string): Promise<void>;
}

let reviewRepository: IReviewRepository | null = null;

/**
 * Drizzle ORM を使用したレビューリポジトリの実装
 */
class DrizzleReviewRepository implements IReviewRepository {
  convertReviewChecklistEntityToReviewChecklist(
    reviewChecklistEntity: ReviewChecklistEntity,
  ): ReviewChecklist {
    return {
      id: reviewChecklistEntity.id,
      reviewHistoryId: reviewChecklistEntity.reviewHistoryId,
      content: reviewChecklistEntity.content,
      createdBy: reviewChecklistEntity.createdBy as ReviewChecklistCreatedBy,
      createdAt: reviewChecklistEntity.createdAt,
      updatedAt: reviewChecklistEntity.updatedAt,
    };
  }

  convertReviewHistoryEntityToReviewHistory(
    reviewHistoryEntity: ReviewHistoryEntity,
  ): RevieHistory {
    const reviewHistory = {
      id: reviewHistoryEntity.id,
      title: reviewHistoryEntity.title,
      additionalInstructions: reviewHistoryEntity.additionalInstructions,
      commentFormat: reviewHistoryEntity.commentFormat,
      evaluationSettings: null,
      createdAt: reviewHistoryEntity.createdAt,
      updatedAt: reviewHistoryEntity.updatedAt,
    } as RevieHistory;
    if (reviewHistoryEntity.evaluationSettings) {
      try {
        reviewHistory.evaluationSettings = JSON.parse(
          reviewHistoryEntity.evaluationSettings,
        ) as CustomEvaluationSettings;
      } catch (err) {
        // JSONパースエラーの場合はnullにフォールバック
        reviewHistory.evaluationSettings = null;
      }
    }
    return reviewHistory;
  }
  /** レビュー履歴を作成 */
  async createReviewHistory(title: string, id?: string): Promise<RevieHistory> {
    try {
      const db = await getDb();
      const [history] = await db
        .insert(reviewHistories)
        .values({ title, id })
        .returning();
      return this.convertReviewHistoryEntityToReviewHistory(history);
    } catch (err) {
      throw repositoryError('レビュー結果の作成に失敗しました', err);
    }
  }

  /** レビュー履歴を取得（存在しない場合は null） */
  async getReviewHistory(id: string): Promise<RevieHistory | null> {
    try {
      const db = await getDb();
      const [history] = await db
        .select()
        .from(reviewHistories)
        .where(eq(reviewHistories.id, id));

      if (!history) return null;
      return this.convertReviewHistoryEntityToReviewHistory(history);
    } catch (err) {
      throw repositoryError('レビュー結果の取得に失敗しました', err);
    }
  }

  /** 全レビュー履歴を取得 */
  async getAllReviewHistories(): Promise<RevieHistory[]> {
    try {
      const db = await getDb();
      const histories = await db
        .select()
        .from(reviewHistories)
        .orderBy(reviewHistories.updatedAt);
      return histories.map((entity) =>
        this.convertReviewHistoryEntityToReviewHistory(entity),
      );
    } catch (err) {
      throw repositoryError('レビュー結果の取得に失敗しました', err);
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
      throw repositoryError('レビュー結果の更新に失敗しました', err);
    }
  }

  /** レビューの追加指示とフォーマットを更新 */
  async updateReviewHistoryAdditionalInstructionsAndCommentFormat(
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
      throw repositoryError(
        'レビューの追加指示・フォーマットの更新に失敗しました',
        err,
      );
    }
  }

  /** レビューの評定項目設定を更新 */
  async updateReviewHistoryEvaluationSettings(
    id: string,
    evaluationSettings?: CustomEvaluationSettings,
  ): Promise<void> {
    try {
      const db = await getDb();
      // オブジェクトをJSON文字列に変換してDBに保存
      const evaluationSettingsJson = evaluationSettings
        ? JSON.stringify(evaluationSettings)
        : null;

      await db
        .update(reviewHistories)
        .set({
          evaluationSettings: evaluationSettingsJson,
        })
        .where(eq(reviewHistories.id, id));
    } catch (err) {
      throw repositoryError(
        'レビューの評定項目設定の更新に失敗しました',
        err,
      );
    }
  }

  /** レビュー履歴を削除 */
  async deleteReviewHistory(id: string): Promise<void> {
    try {
      const db = await getDb();
      await db.delete(reviewHistories).where(eq(reviewHistories.id, id));
    } catch (err) {
      throw repositoryError('レビュー結果の削除に失敗しました', err);
    }
  }

  /** チェックリストを作成 */
  async createChecklist(
    reviewHistoryId: string,
    content: string,
    createdBy: ReviewChecklistCreatedBy,
  ): Promise<void> {
    try {
      const db = await getDb();
      const [checklist] = await db
        .insert(reviewChecklists)
        .values({ reviewHistoryId, content, createdBy })
        .returning();
    } catch (err) {
      throw repositoryError('チェックリストの作成に失敗しました', err);
    }
  }

  /** チェックリスト一覧を取得 */
  async getChecklists(reviewHistoryId: string): Promise<ReviewChecklist[]> {
    try {
      const db = await getDb();
      const reviewChecklistEntities = await db
        .select()
        .from(reviewChecklists)
        .where(eq(reviewChecklists.reviewHistoryId, reviewHistoryId))
        .orderBy(reviewChecklists.updatedAt);
      return reviewChecklistEntities.map((entity) =>
        this.convertReviewChecklistEntityToReviewChecklist(entity),
      );
    } catch (err) {
      throw repositoryError('チェックリスト一覧の取得に失敗しました', err);
    }
  }

  /** チェックリストを更新 */
  async updateChecklist(id: number, content: string): Promise<void> {
    try {
      const db = await getDb();
      const [checklist] = await db
        .update(reviewChecklists)
        .set({ content })
        .where(eq(reviewChecklists.id, id))
        .returning();
      if (!checklist) {
        throw repositoryError('指定されたチェックリストが存在しません', null);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw repositoryError('チェックリストの更新に失敗しました', err);
    }
  }

  /** チェックリストを削除 */
  async deleteChecklist(id: number): Promise<void> {
    try {
      const db = await getDb();
      await db.delete(reviewChecklists).where(eq(reviewChecklists.id, id));
    } catch (err) {
      throw repositoryError('チェックリストの削除に失敗しました', err);
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
      throw repositoryError('チェックリストの削除に失敗しました', err);
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
  ): Promise<void> {
    try {
      const db = await getDb();
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
      }
    } catch (err) {
      throw repositoryError('レビュー結果の保存に失敗しました', err);
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
      throw repositoryError('レビュー結果の削除に失敗しました', err);
    }
  }

  /** チェックリスト結果を取得してグルーピング */
  async getReviewChecklistResults(
    reviewHistoryId: string,
  ): Promise<ReviewChecklistResult[]> {
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

      const map = new Map<number, ReviewChecklistResult>();
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
      throw repositoryError('レビュー結果の取得に失敗しました', err);
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
      throw repositoryError('レビュー結果の削除に失敗しました', err);
    }
  }
}

/**
 * ドキュメントレビュー用のリポジトリを取得
 * @returns ReviewRepositoryのインスタンス
 */
export function getReviewRepository(): IReviewRepository {
  if (!reviewRepository) {
    reviewRepository = new DrizzleReviewRepository();
  }
  return reviewRepository;
}
