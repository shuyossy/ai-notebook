import {
  CustomEvaluationSettings,
  ProcessingStatus,
  RevieHistory,
  ReviewChecklist,
  ReviewChecklistCreatedBy,
  ReviewChecklistResult,
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
}
