import { getReviewRepository } from '../../db/repository/reviewRepository';
import { ReviewChecklistEdit } from '../types';
import { generateReviewTitle } from '../../mastra/workflows/sourceReview/lib';

export class ReviewService {
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
    return this.repository.getReviewChecklistResults(reviewHistoryId);
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
    try {
      // レビュー履歴が存在しない場合は新規作成
      let reviewHistory =
        await this.repository.getReviewHistory(reviewHistoryId);
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

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      return {
        success: false,
        error: `チェックリスト更新処理でエラーが発生しました: ${errorMessage}`,
      };
    }
  }
}
