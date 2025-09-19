import { getReviewRepository } from '@/main/repository/reviewRepository';
import {
  ReviewChecklistEdit,
  ReviewChecklistResult,
  CustomEvaluationSettings,
  UploadFile,
  IpcChannels,
} from '@/types';
import { generateReviewTitle } from '@/mastra/workflows/sourceReview/lib';
import { RevieHistory } from '@/types';
import FileExtractor from '@/main/lib/fileExtractor';
import { CsvParser } from '@/main/lib/csvParser';
import { publishEvent } from '../lib/eventPayloadHelper';
import { internalError, normalizeUnknownError, toPayload } from '../lib/error';

export interface IReviewService {
  getReviewHistories(): Promise<RevieHistory[]>;
  getReviewHistoryDetail(reviewHistoryId: string): Promise<{
    checklistResults: ReviewChecklistResult[];
  }>;
  getReviewInstruction(reviewHistoryId: string): Promise<{
    additionalInstructions?: string;
    commentFormat?: string;
    evaluationSettings?: CustomEvaluationSettings;
  }>;
  deleteReviewHistory(reviewHistoryId: string): Promise<void>;
  updateChecklists(
    reviewHistoryId: string,
    checklistEdits: ReviewChecklistEdit[],
  ): Promise<void>;
  updateReviewInstruction(
    reviewHistoryId: string,
    additionalInstructions: string | undefined,
    commentFormat: string | undefined,
  ): Promise<void>;
  updateReviewEvaluationSettings(
    reviewHistoryId: string,
    evaluationSettings: CustomEvaluationSettings,
  ): Promise<void>;
  extractChecklistFromCsv(
    reviewHistoryId: string,
    files: UploadFile[],
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
    return {
      checklistResults: checklistResults,
    };
  }

  /**
   * レビュー履歴の追加指示、コメントフォーマット、評定項目設定を取得
   */
  public async getReviewInstruction(reviewHistoryId: string) {
    const reviewHistory =
      await this.repository.getReviewHistory(reviewHistoryId);
    return {
      additionalInstructions:
        reviewHistory?.additionalInstructions || undefined,
      commentFormat: reviewHistory?.commentFormat || undefined,
      evaluationSettings: reviewHistory?.evaluationSettings || undefined,
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
  public async updateReviewInstruction(
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

  /**
   * レビュー履歴の評定項目設定を更新
   */
  public async updateReviewEvaluationSettings(
    reviewHistoryId: string,
    evaluationSettings: CustomEvaluationSettings,
  ): Promise<void> {
    return this.repository.updateReviewHistoryEvaluationSettings(
      reviewHistoryId,
      evaluationSettings,
    );
  }

  /**
   * CSVファイルからチェックリストを抽出してDBに保存
   */
  public async extractChecklistFromCsv(
    reviewHistoryId: string,
    files: UploadFile[],
  ): Promise<void> {
    try {
      // レビュー履歴が存在しない場合は新規作成
      let reviewHistory =
        await this.repository.getReviewHistory(reviewHistoryId);
      if (reviewHistory === null) {
        reviewHistory = await this.repository.createReviewHistory(
          generateReviewTitle(),
          reviewHistoryId,
        );
        // 新規作成時はレビュー履歴更新イベントを送信
        publishEvent(IpcChannels.REVIEW_HISTORY_UPDATED, undefined);
      }

      // システム作成のチェックリストを削除（手動作成分は保持）
      await this.repository.deleteSystemCreatedChecklists(reviewHistoryId);

      const allChecklistItems: string[] = [];

      // 各CSVファイルを処理
      for (const file of files) {
        // ファイルからテキストを抽出
        const extractionResult = await FileExtractor.extractText(file.path);
        const csvText = extractionResult.content;

        // CSVパーサーを使用してセル内改行を保持しつつ1列目を抽出
        const firstColumnItems = CsvParser.extractFirstColumn(csvText);

        // 各項目をチェックリスト項目として追加
        for (const item of firstColumnItems) {
          if (item && item.trim() !== '') {
            allChecklistItems.push(item.trim());
          }
        }
      }

      // 重複を除去
      const uniqueChecklistItems = [...new Set(allChecklistItems)];

      // チェックリスト項目をDBに保存
      for (const item of uniqueChecklistItems) {
        await this.repository.createChecklist(reviewHistoryId, item, 'system');
      }
      // AI処理と同様のイベント通知を発火
      publishEvent(IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED, {
        reviewHistoryId,
        status: 'success' as const,
      });
    } catch (error) {
      const normalizedError = normalizeUnknownError(error);
      publishEvent(IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED, {
        reviewHistoryId,
        status: 'failed' as const,
        error: toPayload(normalizedError).message,
      });
    }
  }
}
