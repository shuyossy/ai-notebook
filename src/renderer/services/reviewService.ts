import { ReviewHistory } from '../../db/schema';
import { IpcChannels, IpcEventPayload } from '../../main/types/ipc';
import { UploadFile } from '../components/review/types';

// IPC通信を使用してメインプロセスとやり取りするレビュー機能用のサービス
export const reviewService = {
  /**
   * ドキュメントレビュー履歴を取得
   * @returns ドキュメントレビュー履歴配列
   */
  getHistories: async (): Promise<ReviewHistory[]> => {
    try {
      // IPCを使用してメインプロセスから取得
      const result = await window.electron.review.getHistories();
      if (!result || !result.success) {
        throw new Error(result?.error || '不明なエラー');
      }
      return result.histories || [];
    } catch (error) {
      console.error('ドキュメントレビュー履歴の取得に失敗しました:', error);
      throw error;
    }
  },

  /**
   * ドキュメントレビュー履歴を削除
   * @param reviewHistoryId ドキュメントレビュー履歴ID
   */
  deleteHistory: async (reviewHistoryId: string): Promise<void> => {
    try {
      // IPCを使用してメインプロセスから削除
      const result =
        await window.electron.review.deleteHistory(reviewHistoryId);
      if (!result.success) {
        throw new Error(result?.error || '不明なエラー');
      }
    } catch (error) {
      console.error('ドキュメントレビュー履歴の削除に失敗しました:', error);
      throw error;
    }
  },

  /**
   * ドキュメントレビュー履歴の詳細情報抽出
   * @param reviewHistoryId ドキュメントレビュー履歴ID
   * @returns 抽出されたチェックリスト
   */
  getReviewHistoryDetail: async (historyId: string) => {
    try {
      const result = await window.electron.review.getHistoryDetail(historyId);
      if (!result.success) {
        throw new Error(result.error || '不明なエラー');
      }
      return {
        checklists: result.checklistResults || [],
        additionalInstructions: result.additionalInstructions,
        commentFormat: result.commentFormat,
      };
    } catch (error) {
      console.error('チェックリストの取得に失敗しました:', error);
      throw error;
    }
  },

  /**
   * チェックリスト抽出を呼び出す
   * @param reviewHistoryId レビュー履歴ID
   * @param sourceIds 抽出対象のソースID配列
   * @returns チェックリスト抽出結果
   */
  callChecklistExtraction: async (
    reviewHistoryId: string,
    files: UploadFile[],
  ) => {
    try {
      const result = await window.electron.review.extractChecklist({
        reviewHistoryId,
        files,
      });
      if (!result.success) {
        throw new Error(result.error || '不明なエラー');
      }
      return result;
    } catch (error) {
      console.error('チェックリスト抽出の呼び出しに失敗しました:', error);
      throw error;
    }
  },

  subscribeChecklistExtractionFinished: (
    callback: (
      payload: IpcEventPayload<
        typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED
      >,
    ) => void,
  ) => {
    return window.electron.review.onExtractChecklistFinished((payload) => {
      callback(payload);
    });
  },

  subscribeReviewExecutionFinished: (
    callback: (
      payload: IpcEventPayload<typeof IpcChannels.REVIEW_EXECUTE_FINISHED>,
    ) => void,
  ) => {
    return window.electron.review.onExecuteReviewFinished((payload) => {
      callback(payload);
    });
  },
};

export default reviewService;
