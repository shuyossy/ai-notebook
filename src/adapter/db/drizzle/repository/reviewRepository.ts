import { eq, and } from 'drizzle-orm';
import {
  reviewHistories,
  reviewChecklists,
  ReviewChecklistEntity,
  ReviewHistoryEntity,
} from '../schema';
import getDb from '..';
import type {
  RevieHistory,
  ReviewChecklist,
  ReviewChecklistResult,
  ReviewEvaluation,
  ReviewChecklistCreatedBy,
  CustomEvaluationSettings,
  ProcessingStatus,
} from '@/types';
import { AppError } from '@/main/lib/error';
import { repositoryError } from '@/main/lib/error';
import { IReviewRepository } from '@/main/service/port/repository';

/**
 * Drizzle ORM を使用したレビューリポジトリの実装
 */
export class DrizzleReviewRepository implements IReviewRepository {
  convertReviewChecklistEntityToReviewChecklist(
    reviewChecklistEntity: ReviewChecklistEntity,
  ): ReviewChecklist {
    return {
      id: reviewChecklistEntity.id,
      reviewHistoryId: reviewChecklistEntity.reviewHistoryId,
      content: reviewChecklistEntity.content,
      evaluation: reviewChecklistEntity.evaluation as ReviewEvaluation | null,
      comment: reviewChecklistEntity.comment,
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
      targetDocumentName: reviewHistoryEntity.targetDocumentName,
      additionalInstructions: reviewHistoryEntity.additionalInstructions,
      commentFormat: reviewHistoryEntity.commentFormat,
      evaluationSettings: null,
      processingStatus: (reviewHistoryEntity.processingStatus ||
        'idle') as ProcessingStatus,
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
      throw repositoryError('レビューの評定項目設定の更新に失敗しました', err);
    }
  }

  /** 処理ステータスを更新 */
  async updateReviewHistoryProcessingStatus(
    id: string,
    processingStatus: ProcessingStatus,
  ): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(reviewHistories)
        .set({
          processingStatus,
        })
        .where(eq(reviewHistories.id, id));
    } catch (err) {
      throw repositoryError(
        'レビューの処理ステータスの更新に失敗しました',
        err,
      );
    }
  }

  /** レビュー対象ドキュメント名を更新 */
  async updateReviewHistoryTargetDocumentName(
    id: string,
    targetDocumentName: string,
  ): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(reviewHistories)
        .set({
          targetDocumentName,
        })
        .where(eq(reviewHistories.id, id));
    } catch (err) {
      throw repositoryError(
        'レビュー対象ドキュメント名の更新に失敗しました',
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
    }[],
  ): Promise<void> {
    try {
      const db = await getDb();
      for (const result of results) {
        await db
          .update(reviewChecklists)
          .set({
            evaluation: result.evaluation,
            comment: result.comment,
          })
          .where(eq(reviewChecklists.id, result.reviewChecklistId));
      }
    } catch (err) {
      throw repositoryError('レビュー結果の保存に失敗しました', err);
    }
  }

  /** チェックリスト結果を取得してグルーピング */
  async getReviewChecklistResults(
    reviewHistoryId: string,
  ): Promise<ReviewChecklistResult[]> {
    try {
      const db = await getDb();
      const rows = await db
        .select()
        .from(reviewChecklists)
        .where(eq(reviewChecklists.reviewHistoryId, reviewHistoryId))
        .orderBy(reviewChecklists.createdAt);

      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        sourceEvaluation: row.evaluation
          ? {
              evaluation: row.evaluation as ReviewEvaluation,
              comment: row.comment ?? undefined,
            }
          : undefined,
      }));
    } catch (err) {
      throw repositoryError('レビュー結果の取得に失敗しました', err);
    }
  }

  /** すべてのレビュー結果を削除 */
  async deleteAllReviewResults(reviewHistoryId: string): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(reviewChecklists)
        .set({
          evaluation: null,
          comment: null,
        })
        .where(eq(reviewChecklists.reviewHistoryId, reviewHistoryId));
    } catch (err) {
      throw repositoryError('レビュー結果の削除に失敗しました', err);
    }
  }
}
