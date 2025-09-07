import { getReviewRepository } from '@/main/repository/reviewRepository';
import { ReviewChecklistEdit, ReviewChecklistResultDisplay } from '@/types';
import { generateReviewTitle } from '@/mastra/workflows/sourceReview/lib';
import { ReviewHistory } from '@/db/schema';

export interface IReviewService {
  getReviewHistories(): Promise<ReviewHistory[]>;
  getReviewHistoryDetail(reviewHistoryId: string): Promise<{
    checklistResults: ReviewChecklistResultDisplay[];
    additionalInstructions: string | undefined;
    commentFormat: string | undefined;
  }>;
  deleteReviewHistory(reviewHistoryId: string): Promise<void>;
  updateChecklists(
    reviewHistoryId: string,
    checklistEdits: ReviewChecklistEdit[],
  ): Promise<void>;
  updateReviewHistoryAdditionalInstructionsAndCommentFormat(
    reviewHistoryId: string,
    additionalInstructions: string | undefined,
    commentFormat: string | undefined,
  ): Promise<void>;
}

export class ReviewService implements IReviewService {
  // シングルトン変数
  private static instance: ReviewService;

  // シングルトンインスタンスを取得
  public static getInstance(): ReviewService {
    if (!ReviewService.instance) {
      ReviewService.instance = new ReviewService();
    }
    return ReviewService.instance;
  }

  private repository = getReviewRepository();

  /**
   * レビュー履歴一覧を取得
   */
  public async getReviewHistories() {
    return this.repository.getAllReviewHistories();
  }

  /**
   * レビュー履歴の詳細（チェックリスト結果）を取得
   */
  public async getReviewHistoryDetail(reviewHistoryId: string) {
    const checklistResults =
      await this.repository.getReviewChecklistResults(reviewHistoryId);
    const reviewHistory =
      await this.repository.getReviewHistory(reviewHistoryId);
    return {
      checklistResults: checklistResults,
      additionalInstructions:
        reviewHistory?.additionalInstructions || undefined,
      commentFormat: reviewHistory?.commentFormat || undefined,
    };
  }

  /**
   * レビュー履歴を削除
   */
  public async deleteReviewHistory(reviewHistoryId: string) {
    return this.repository.deleteReviewHistory(reviewHistoryId);
  }

  /**
   * チェックリストを更新
   */
  public async updateChecklists(
    reviewHistoryId: string,
    checklistEdits: ReviewChecklistEdit[],
  ) {
    // レビュー履歴が存在しない場合は新規作成
    let reviewHistory = await this.repository.getReviewHistory(reviewHistoryId);
    if (reviewHistory === null) {
      reviewHistory = await this.repository.createReviewHistory(
        generateReviewTitle(),
        reviewHistoryId,
      );
    }

    // チェックリストの編集を実行
    // 現状は一度に一つのチェックリスト編集しか行わない（checklistEditsの要素数は1つ）の想定なので、トランザクション制御などは行わない
    for (const edit of checklistEdits) {
      if (edit.id === null) {
        // 新規作成
        if (edit.content) {
          await this.repository.createChecklist(
            reviewHistoryId,
            edit.content,
            'user',
          );
        }
      } else if (edit.delete) {
        // 削除
        await this.repository.deleteChecklist(edit.id);
      } else if (edit.content) {
        // 更新
        await this.repository.updateChecklist(edit.id, edit.content);
      }
    }
  }

  /**
   * レビュー履歴の追加指示とコメントフォーマットを更新
   */
  public async updateReviewHistoryAdditionalInstructionsAndCommentFormat(
    reviewHistoryId: string,
    additionalInstructions: string | undefined,
    commentFormat: string | undefined,
  ) {
    return this.repository.updateReviewHistoryAdditionalInstructionsAndCommentFormat(
      reviewHistoryId,
      additionalInstructions,
      commentFormat,
    );
  }
}
