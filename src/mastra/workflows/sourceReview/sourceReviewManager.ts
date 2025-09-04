import { IpcMainInvokeEvent } from 'electron';
import { getReviewRepository } from '../../../db/repository/reviewRepository';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import {
  IpcChannels,
  IpcEventPayloadMap,
  IpcResponsePayloadMap,
} from '../../../main/types/ipc';
import { generateReviewTitle } from './lib';
import { ReviewHistory } from '../../../db/schema';
import { mastra } from '../..';
import {
  DocumentType,
  UploadFile,
} from '../../../renderer/components/review/types';
import { checkStatus } from '../libs';

/**
 * ソースレビュー処理を管理するクラス
 */
export default class SourceReviewManager {
  // eslint-disable-next-line
  private static instance: SourceReviewManager | null = null;

  private reviewRepository = getReviewRepository();

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): SourceReviewManager {
    if (!SourceReviewManager.instance) {
      SourceReviewManager.instance = new SourceReviewManager();
    }
    return SourceReviewManager.instance;
  }

  /**
   * アップロードファイルからチェックリスト抽出処理を実行
   * @param reviewHistoryId レビュー履歴ID（新規の場合は生成）
   * @param files アップロードファイルの配列
   * @returns 処理結果
   */
  public async extractChecklist(
    reviewHistoryId: string,
    files: UploadFile[],
    documentType: DocumentType = 'checklist',
    checklistRequirements?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let reviewHistory: ReviewHistory | null;
      reviewHistory =
        await this.reviewRepository.getReviewHistory(reviewHistoryId);
      // レビュー履歴が存在しない場合は新規作成
      if (reviewHistory === null) {
        reviewHistory = await this.reviewRepository.createReviewHistory(
          generateReviewTitle(),
          reviewHistoryId,
        );
      } else {
        // 既存のレビュー履歴がある場合は、システム作成チェックリストを削除
        await this.reviewRepository.deleteSystemCreatedChecklists(
          reviewHistory.id,
        );
      }

      // Mastraワークフローを実行
      const workflow = mastra.getWorkflow('checklistExtractionWorkflow');

      if (!workflow) {
        return {
          success: false,
          error: 'チェックリスト抽出ワークフローが見つかりません',
        };
      }

      const run = workflow.createRun();
      const runResult = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentType,
          checklistRequirements,
        },
      });

      // 結果を確認
      const checkResult = checkStatus(runResult);
      return {
        success: checkResult.status === 'success',
        error: checkResult.errorMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      return {
        success: false,
        error: `チェックリスト抽出処理でエラーが発生しました: ${errorMessage}`,
      };
    }
  }

  /**
   * アップロードファイルからレビュー実行処理を実行
   * @param reviewHistoryId レビュー履歴ID
   * @param files アップロードファイルの配列
   * @returns 処理結果
   */
  public async executeReview(
    reviewHistoryId: string,
    files: UploadFile[],
    additionalInstructions?: string,
    commentFormat?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // レビュー履歴の存在確認
      const reviewHistory =
        await this.reviewRepository.getReviewHistory(reviewHistoryId);
      if (!reviewHistory) {
        return {
          success: false,
          error: `チェックリストが一度も作成されていません`,
        };
      }

      // Mastraワークフローを実行
      const workflow = mastra.getWorkflow('reviewExecutionWorkflow');

      if (!workflow) {
        return {
          success: false,
          error: 'レビュー実行ワークフローが見つかりません',
        };
      }

      // タイトルの変更
      const fileNames = files.map((f) => f.name.replace(/\.[^/.]+$/, '')); // 拡張子を除いたファイル名
      const reviewTitle = generateReviewTitle(fileNames);
      // レビュー履歴のタイトルと追加データを更新
      await this.reviewRepository.updateReviewHistoryTitle(
        reviewHistory.id,
        reviewTitle,
      );
      await this.reviewRepository.updateReviewHistoryAdditionalData(
        reviewHistory.id,
        additionalInstructions,
        commentFormat,
      );

      const run = workflow.createRun();
      const result = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          additionalInstructions,
          commentFormat,
        },
      });
      // 結果を確認
      const checkResult = checkStatus(result);
      return {
        success: checkResult.status === 'success',
        error: checkResult.errorMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      return {
        success: false,
        error: `レビュー実行処理でエラーが発生しました: ${errorMessage}`,
      };
    }
  }

  /**
   * IPC通信でチェックリスト抽出処理を実行し、完了時にイベントを送信
   * @param reviewHistoryId レビュー履歴ID
   * @param sourceIds ソースIDの配列
   * @param mainWindow メインウィンドウ
   */
  public extractChecklistWithNotification(
    reviewHistoryId: string,
    files: UploadFile[],
    event: IpcMainInvokeEvent,
    documentType: DocumentType = 'checklist',
    checklistRequirements?: string,
  ): IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL] {
    try {
      this.extractChecklist(
        reviewHistoryId,
        files,
        documentType,
        checklistRequirements,
      )
        .then((res) => {
          // 完了イベントを送信
          event.sender.send(IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED, {
            success: res.success,
            error: res.error,
          } as IpcEventPayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED]);
          return true;
        })
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : '不明なエラー';
          const errorResult = {
            success: false,
            error: errorMessage,
          };
          // エラーイベントを送信
          event.sender.send(
            IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
            errorResult,
          );
        });
      return {
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      const errorResult = {
        success: false,
        error: errorMessage,
      };
      // エラーイベントを送信
      event.sender.send(
        IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
        errorResult,
      );
      return errorResult;
    }
  }

  /**
   * IPC通信でレビュー実行処理を実行し、完了時にイベントを送信
   * @param reviewHistoryId レビュー履歴ID
   * @param sourceIds ソースIDの配列
   * @param mainWindow メインウィンドウ
   */
  public executeReviewWithNotification(
    reviewHistoryId: string,
    files: UploadFile[],
    event: IpcMainInvokeEvent,
    additionalInstructions?: string,
    commentFormat?: string,
  ): IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL] {
    try {
      this.executeReview(
        reviewHistoryId,
        files,
        additionalInstructions,
        commentFormat,
      )
        .then((res) => {
          // 完了イベントを送信
          event.sender.send(IpcChannels.REVIEW_EXECUTE_FINISHED, {
            success: res.success,
            error: res.error,
          } as IpcEventPayloadMap[typeof IpcChannels.REVIEW_EXECUTE_FINISHED]);
          return true;
        })
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : '不明なエラー';
          const errorResult = {
            success: false,
            error: errorMessage,
          } as IpcEventPayloadMap[typeof IpcChannels.REVIEW_EXECUTE_FINISHED];
          // エラーイベントを送信
          event.sender.send(IpcChannels.REVIEW_EXECUTE_FINISHED, errorResult);
        });
      return {
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '不明なエラー';
      const errorResult = {
        success: false,
        error: errorMessage,
      };

      // エラーイベントを送信
      event.sender.send(IpcChannels.REVIEW_EXECUTE_FINISHED, errorResult);

      return errorResult;
    }
  }
}
