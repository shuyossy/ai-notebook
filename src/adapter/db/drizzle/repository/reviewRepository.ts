import { eq, and, inArray, max } from 'drizzle-orm';
import {
  reviewHistories,
  reviewChecklists,
  reviewDocumentCaches,
  reviewLargedocumentResultCaches,
  ReviewChecklistEntity,
  ReviewHistoryEntity,
  ReviewDocumentCacheEntity,
  ReviewLargedocumentResultCacheEntity,
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
  DocumentMode,
  ReviewDocumentCache,
  ReviewLargedocumentResultCache,
  ProcessMode,
} from '@/types';
import { AppError, internalError } from '@/main/lib/error';
import { repositoryError } from '@/main/lib/error';
import { IReviewRepository } from '@/main/service/port/repository';
import { ReviewCacheHelper } from '@/main/lib/utils/reviewCacheHelper';

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

  /** documentModeを更新 */
  async updateReviewHistoryDocumentMode(
    id: string,
    documentMode: DocumentMode,
  ): Promise<void> {
    try {
      const db = await getDb();
      await db
        .update(reviewHistories)
        .set({
          documentMode,
        })
        .where(eq(reviewHistories.id, id));
    } catch (err) {
      throw repositoryError('ドキュメントモードの更新に失敗しました', err);
    }
  }

  /**
   * ReviewDocumentCacheEntity → ReviewDocumentCache の変換
   * cachePathからファイルを読み込んでtextContent/imageDataに変換
   */
  private async convertDocumentCacheEntityToDomain(
    entity: ReviewDocumentCacheEntity,
  ): Promise<ReviewDocumentCache> {
    const base = {
      id: entity.id,
      reviewHistoryId: entity.reviewHistoryId,
      documentId: entity.documentId,
      fileName: entity.fileName,
      processMode: entity.processMode as ProcessMode,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };

    try {
      // cachePathからファイルを読み込む
      if (entity.processMode === 'text') {
        const textContent = await ReviewCacheHelper.loadTextCache(
          entity.cachePath,
        );
        return { ...base, textContent };
      } else if (entity.processMode === 'image') {
        const imageData = await ReviewCacheHelper.loadImageCache(
          entity.cachePath,
        );
        return { ...base, imageData };
      }

      throw repositoryError('無効なprocessModeです', null);
    } catch (error) {
      // キャッシュファイル読み込みエラーの場合は専用のエラーメッセージを返す
      if (error instanceof Error && error.message.includes('Failed to load')) {
        throw internalError({
          expose: true,
          messageCode: 'REVIEW_DOCUMENT_CACHE_NOT_FOUND',
          cause: error,
        });
      }
      // その他のエラーはそのまま再スロー
      throw error;
    }
  }

  /** ドキュメントキャッシュを作成 */
  async createReviewDocumentCache(
    cache: Omit<ReviewDocumentCache, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ReviewDocumentCache> {
    try {
      // 1. ファイルシステムにキャッシュを保存
      let cachePath: string;

      if (cache.processMode === 'text' && cache.textContent) {
        cachePath = await ReviewCacheHelper.saveTextCache(
          cache.reviewHistoryId,
          cache.documentId,
          cache.textContent,
        );
      } else if (cache.processMode === 'image' && cache.imageData) {
        cachePath = await ReviewCacheHelper.saveImageCache(
          cache.reviewHistoryId,
          cache.documentId,
          cache.imageData,
        );
      } else {
        throw repositoryError(
          '無効なprocessModeまたはデータが不足しています',
          null,
        );
      }

      // 2. DBにメタデータを保存
      const db = await getDb();
      const [entity] = await db
        .insert(reviewDocumentCaches)
        .values({
          reviewHistoryId: cache.reviewHistoryId,
          documentId: cache.documentId,
          fileName: cache.fileName,
          processMode: cache.processMode,
          cachePath,
        })
        .returning();

      // 3. ファイルから読み込んでドメイン型に変換して返す
      return this.convertDocumentCacheEntityToDomain(entity);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw repositoryError('ドキュメントキャッシュの作成に失敗しました', err);
    }
  }

  /** ドキュメントキャッシュ一覧を取得 */
  async getReviewDocumentCaches(
    reviewHistoryId: string,
  ): Promise<ReviewDocumentCache[]> {
    try {
      const db = await getDb();
      const entities = await db
        .select()
        .from(reviewDocumentCaches)
        .where(eq(reviewDocumentCaches.reviewHistoryId, reviewHistoryId))
        .orderBy(reviewDocumentCaches.createdAt);

      // 各EntityをDomain型に変換（ファイル読み込み含む）
      return Promise.all(
        entities.map((entity) =>
          this.convertDocumentCacheEntityToDomain(entity),
        ),
      );
    } catch (err) {
      throw repositoryError('ドキュメントキャッシュの取得に失敗しました', err);
    }
  }

  /** documentIdでドキュメントキャッシュを取得 */
  async getReviewDocumentCacheByDocumentId(
    reviewHistoryId: string,
    documentId: string,
  ): Promise<ReviewDocumentCache | null> {
    try {
      const db = await getDb();
      const [entity] = await db
        .select()
        .from(reviewDocumentCaches)
        .where(
          and(
            eq(reviewDocumentCaches.reviewHistoryId, reviewHistoryId),
            eq(reviewDocumentCaches.documentId, documentId),
          ),
        );

      if (!entity) return null;

      return this.convertDocumentCacheEntityToDomain(entity);
    } catch (err) {
      throw repositoryError('ドキュメントキャッシュの取得に失敗しました', err);
    }
  }

  /** ドキュメントキャッシュを取得（複数ID対応） */
  async getReviewDocumentCacheByDocumentIds(
    reviewHistoryId: string,
    documentIds: string[],
  ): Promise<ReviewDocumentCache[]> {
    try {
      const db = await getDb();
      const entities = await db
        .select()
        .from(reviewDocumentCaches)
        .where(
          and(
            eq(reviewDocumentCaches.reviewHistoryId, reviewHistoryId),
            inArray(reviewDocumentCaches.documentId, documentIds),
          ),
        );

      // 各EntityをDomain型に変換（ファイル読み込み含む）
      return Promise.all(
        entities.map((entity) =>
          this.convertDocumentCacheEntityToDomain(entity),
        ),
      );
    } catch (err) {
      throw repositoryError('ドキュメントキャッシュの取得に失敗しました', err);
    }
  }

  /** チェックリスト結果キャッシュを作成 */
  async createReviewLargedocumentResultCache(
    cache: ReviewLargedocumentResultCache,
  ): Promise<void> {
    try {
      const db = await getDb();
      await db.insert(reviewLargedocumentResultCaches).values({
        reviewDocumentCacheId: cache.reviewDocumentCacheId,
        reviewChecklistId: cache.reviewChecklistId,
        comment: cache.comment,
        totalChunks: cache.totalChunks,
        chunkIndex: cache.chunkIndex,
        individualFileName: cache.individualFileName,
      });
    } catch (err) {
      throw repositoryError(
        '大量ドキュメント結果キャッシュの作成に失敗しました',
        err,
      );
    }
  }

  /** チェックリスト結果キャッシュ一覧を取得 */
  async getReviewLargedocumentResultCaches(
    reviewHistoryId: string,
  ): Promise<ReviewLargedocumentResultCache[]> {
    try {
      const db = await getDb();
      // reviewDocumentCachesとjoinしてreviewHistoryIdで絞り込む
      const results = await db
        .select({
          reviewDocumentCacheId:
            reviewLargedocumentResultCaches.reviewDocumentCacheId,
          reviewChecklistId: reviewLargedocumentResultCaches.reviewChecklistId,
          comment: reviewLargedocumentResultCaches.comment,
          totalChunks: reviewLargedocumentResultCaches.totalChunks,
          chunkIndex: reviewLargedocumentResultCaches.chunkIndex,
          individualFileName:
            reviewLargedocumentResultCaches.individualFileName,
        })
        .from(reviewLargedocumentResultCaches)
        .innerJoin(
          reviewDocumentCaches,
          eq(
            reviewLargedocumentResultCaches.reviewDocumentCacheId,
            reviewDocumentCaches.id,
          ),
        )
        .where(eq(reviewDocumentCaches.reviewHistoryId, reviewHistoryId));

      return results.map((row) => ({
        reviewDocumentCacheId: row.reviewDocumentCacheId,
        reviewChecklistId: row.reviewChecklistId,
        comment: row.comment,
        totalChunks: row.totalChunks,
        chunkIndex: row.chunkIndex,
        individualFileName: row.individualFileName,
      }));
    } catch (err) {
      throw repositoryError(
        '大量ドキュメント結果キャッシュの取得に失敗しました',
        err,
      );
    }
  }

  /** 特定ドキュメントの最大totalChunks数を取得（レビューチャット用） */
  async getMaxTotalChunksForDocument(
    reviewHistoryId: string,
    documentId: string,
  ): Promise<number> {
    try {
      const db = await getDb();

      // まずdocumentIdからreviewDocumentCacheIdを取得
      const [cache] = await db
        .select({ id: reviewDocumentCaches.id })
        .from(reviewDocumentCaches)
        .where(
          and(
            eq(reviewDocumentCaches.reviewHistoryId, reviewHistoryId),
            eq(reviewDocumentCaches.documentId, documentId),
          ),
        );

      if (!cache) {
        // ドキュメントキャッシュが存在しない場合は1を返す
        return 1;
      }

      // 該当ドキュメントのtotalChunksの最大値を取得
      const result = await db
        .select({ maxChunks: max(reviewLargedocumentResultCaches.totalChunks) })
        .from(reviewLargedocumentResultCaches)
        .where(
          eq(reviewLargedocumentResultCaches.reviewDocumentCacheId, cache.id),
        );

      const maxChunks = result[0]?.maxChunks;

      // レコードが存在しない場合は1を返す（初回処理）
      return maxChunks ?? 1;
    } catch (err) {
      throw repositoryError(
        'ドキュメントの最大チャンク数取得に失敗しました',
        err,
      );
    }
  }

  /** レビューチャット用: チェックリストと結果を取得 */
  async getChecklistResultsWithIndividualResults(
    reviewHistoryId: string,
    checklistIds: number[],
  ): Promise<
    Array<{
      checklistResult: ReviewChecklistResult;
      individualResults?: Array<{
        documentId: number;
        comment: string;
        individualFileName: string;
      }>;
    }>
  > {
    try {
      const db = await getDb();

      // チェックリストを取得
      const checklistEntities = await db
        .select()
        .from(reviewChecklists)
        .where(
          and(
            eq(reviewChecklists.reviewHistoryId, reviewHistoryId),
            inArray(reviewChecklists.id, checklistIds),
          ),
        );

      // 個別レビュー結果キャッシュを取得
      const individualCaches =
        await this.getReviewLargedocumentResultCaches(reviewHistoryId);

      // 結果を組み立て
      return checklistEntities.map((entity) => {
        // 個別レビュー結果を抽出
        const individualResults = individualCaches
          .filter((cache) => cache.reviewChecklistId === entity.id)
          .map((cache) => ({
            documentId: cache.reviewDocumentCacheId,
            comment: cache.comment,
            individualFileName: cache.individualFileName,
          }));

        // ReviewChecklistResult型を構築
        const checklistResult: ReviewChecklistResult = {
          id: entity.id,
          content: entity.content,
          sourceEvaluation: {
            evaluation: entity.evaluation ?? undefined,
            comment: entity.comment ?? undefined,
          },
        };

        return {
          checklistResult,
          individualResults:
            individualResults.length > 0 ? individualResults : undefined,
        };
      });
    } catch (err) {
      throw repositoryError('チェックリストと結果の取得に失敗しました', err);
    }
  }
}
