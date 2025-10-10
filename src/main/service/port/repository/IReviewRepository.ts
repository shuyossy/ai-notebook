import {
  CustomEvaluationSettings,
  DocumentMode,
  ProcessingStatus,
  RevieHistory,
  ReviewChecklist,
  ReviewChecklistCreatedBy,
  ReviewChecklistResult,
  ReviewDocumentCache,
  ReviewLargedocumentResultCache,
  ReviewEvaluation,
} from '@/types';

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
  updateReviewHistoryProcessingStatus(
    id: string,
    processingStatus: ProcessingStatus,
  ): Promise<void>;
  updateReviewHistoryTargetDocumentName(
    id: string,
    targetDocumentName: string,
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
    }[],
  ): Promise<void>;
  getReviewChecklistResults(
    reviewHistoryId: string,
  ): Promise<ReviewChecklistResult[]>;
  deleteAllReviewResults(reviewHistoryId: string): Promise<void>;

  // documentModeの保存
  updateReviewHistoryDocumentMode(
    id: string,
    documentMode: DocumentMode,
  ): Promise<void>;

  // ドキュメントキャッシュ管理
  createReviewDocumentCache(
    cache: Omit<ReviewDocumentCache, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ReviewDocumentCache>;
  getReviewDocumentCaches(
    reviewHistoryId: string,
  ): Promise<ReviewDocumentCache[]>;
  getReviewDocumentCacheByDocumentId(
    reviewHistoryId: string,
    documentId: string,
  ): Promise<ReviewDocumentCache | null>;

  // 大量ドキュメント結果キャッシュ管理
  createReviewLargedocumentResultCache(
    cache: ReviewLargedocumentResultCache,
  ): Promise<void>;
  getReviewLargedocumentResultCaches(
    reviewHistoryId: string,
  ): Promise<ReviewLargedocumentResultCache[]>;

  // レビューチャット用: チェックリスト結果と個別レビュー結果を取得
  getChecklistResultsWithIndividualResults(
    reviewHistoryId: string,
    checklistIds: number[],
  ): Promise<
    Array<{
      checklistResult: ReviewChecklistResult;
      individualResults?: Array<{
        documentId: number;
        comment: string;
      }>;
    }>
  >;
}
