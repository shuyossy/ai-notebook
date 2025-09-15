import { getReviewRepository } from '@/main/repository/reviewRepository';
import { IpcChannels } from '@/types/ipc';
import { generateReviewTitle } from './lib';
import { RevieHistory, CustomEvaluationSettings } from '@/types';
import { mastra } from '../..';
import {
  ChecklistExtractionResultStatus,
  DocumentType,
  ReviewExecutionResultStatus,
  UploadFile,
} from '@/types';
import { checkWorkflowResult } from '../../lib/workflowUtils';
import { internalError, normalizeUnknownError } from '@/main/lib/error';
import { getMainLogger } from '@/main/lib/logger';
import { formatMessage } from '@/main/lib/messages';
import { publishEvent } from '@/main/lib/eventPayloadHelper';

const logger = getMainLogger();

/**
 * ソースレビュー処理を管理するクラス
 */
export default class SourceReviewManager {
  private static instance: SourceReviewManager | null = null;

  private reviewRepository = getReviewRepository();

  // 実行中のワークフロー管理
  private runningWorkflows = new Map<string, { cancel: () => void }>();

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
  ): Promise<{ status: ChecklistExtractionResultStatus; error?: string }> {
    try {
      let reviewHistory: RevieHistory | null;
      reviewHistory =
        await this.reviewRepository.getReviewHistory(reviewHistoryId);
      // レビュー履歴が存在しない場合は新規作成
      if (reviewHistory === null) {
        reviewHistory = await this.reviewRepository.createReviewHistory(
          generateReviewTitle(),
          reviewHistoryId,
        );
        // 新規作成時はレビュー履歴更新イベントを送信
        publishEvent(IpcChannels.REVIEW_HISTORY_UPDATED, undefined);
      } else {
        // 既存のレビュー履歴がある場合は、システム作成チェックリストを削除
        await this.reviewRepository.deleteSystemCreatedChecklists(
          reviewHistory.id,
        );
      }

      // Mastraワークフローを実行
      const workflow = mastra.getWorkflow('checklistExtractionWorkflow');

      if (!workflow) {
        logger.error('レビュー実行ワークフローが見つかりません');
        throw internalError({
          expose: false,
        });
      }

      const run = await workflow.createRunAsync();

      // 実行中のワークフローを管理
      this.runningWorkflows.set(reviewHistoryId, {
        cancel: () => run.cancel(),
      });

      const runResult = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentType,
          checklistRequirements,
        },
      });

      // 結果を確認
      const checkResult = checkWorkflowResult(runResult);

      // クリーンアップ
      this.runningWorkflows.delete(reviewHistoryId);

      return {
        status: checkResult.status,
        error: checkResult.errorMessage,
      };
    } catch (error) {
      logger.error(error, 'チェックリスト抽出処理に失敗しました');

      // エラー時もクリーンアップ
      this.runningWorkflows.delete(reviewHistoryId);

      const err = normalizeUnknownError(error);
      const errorMessage = err.message;
      return {
        status: 'failed',
        error: formatMessage('REVIEW_CHECKLIST_EXTRACTION_ERROR', {
          detail: errorMessage,
        }),
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
    evaluationSettings: CustomEvaluationSettings,
    additionalInstructions?: string,
    commentFormat?: string,
  ): Promise<{ status: ReviewExecutionResultStatus; error?: string }> {
    try {
      // レビュー履歴の存在確認
      const reviewHistory =
        await this.reviewRepository.getReviewHistory(reviewHistoryId);
      if (!reviewHistory) {
        return {
          status: 'failed',
          error: `チェックリストが一度も作成されていません`,
        };
      }

      // Mastraワークフローを実行
      const workflow = mastra.getWorkflow('reviewExecutionWorkflow');

      if (!workflow) {
        logger.error('レビュー実行ワークフローが見つかりません');
        throw internalError({
          expose: false,
        });
      }

      // タイトルの変更
      const fileNames = files.map((f) => f.name.replace(/\.[^/.]+$/, '')); // 拡張子を除いたファイル名
      const reviewTitle = generateReviewTitle(fileNames);
      // レビュー履歴のタイトルと追加データを更新
      await this.reviewRepository.updateReviewHistoryTitle(
        reviewHistory.id,
        reviewTitle,
      );
      // タイトル更新時はレビュー履歴更新イベントを送信
      publishEvent(IpcChannels.REVIEW_HISTORY_UPDATED, undefined);

      const run = await workflow.createRunAsync();

      // 実行中のワークフローを管理
      this.runningWorkflows.set(reviewHistoryId, {
        cancel: () => run.cancel(),
      });

      const result = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          evaluationSettings,
          additionalInstructions,
          commentFormat,
        },
      });
      console.log(
        'Review Execution Workflow Result:',
        JSON.stringify(result, null, 2),
      );
      // 結果を確認
      const checkResult = checkWorkflowResult(result);

      // クリーンアップ
      this.runningWorkflows.delete(reviewHistoryId);

      return {
        status: checkResult.status,
        error: checkResult.errorMessage,
      };
    } catch (error) {
      logger.error(error, 'レビュー実行処理に失敗しました');

      // エラー時もクリーンアップ
      this.runningWorkflows.delete(reviewHistoryId);

      const err = normalizeUnknownError(error);
      const errorMessage = err.message;
      return {
        status: 'failed',
        error: formatMessage('REVIEW_EXECUTION_ERROR', {
          detail: errorMessage,
        }),
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
    documentType: DocumentType = 'checklist',
    checklistRequirements?: string,
  ): { success: boolean; error?: string } {
    try {
      this.extractChecklist(
        reviewHistoryId,
        files,
        documentType,
        checklistRequirements,
      )
        .then((res) => {
          // 完了イベントを送信
          publishEvent(IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED, {
            status: res.status,
            error: res.error,
          });
          return true;
        })
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : '不明なエラー';
          const errorResult = {
            status: 'failed' as ChecklistExtractionResultStatus,
            error: errorMessage,
          };
          // エラーイベントを送信
          publishEvent(
            IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
            errorResult,
          );
        });
      return {
        success: true,
      };
    } catch (error) {
      logger.error(error, 'チェックリスト抽出処理に失敗しました');
      const err = normalizeUnknownError(error);
      const errorMessage = err.message;
      const errorResult = {
        success: false,
        error: errorMessage,
      };
      const payloadResult = {
        status: 'failed' as ChecklistExtractionResultStatus,
        error: errorMessage,
      };
      // エラーイベントを送信
      publishEvent(
        IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
        payloadResult,
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
    evaluationSettings: CustomEvaluationSettings,
    additionalInstructions?: string,
    commentFormat?: string,
  ): { success: boolean; error?: string } {
    try {
      this.executeReview(
        reviewHistoryId,
        files,
        evaluationSettings,
        additionalInstructions,
        commentFormat,
      )
        .then((res) => {
          // 完了イベントを送信
          publishEvent(IpcChannels.REVIEW_EXECUTE_FINISHED, {
            status: res.status,
            error: res.error,
          });
          return true;
        })
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : '不明なエラー';
          const errorResult = {
            status: 'failed' as ReviewExecutionResultStatus,
            error: errorMessage,
          };
          // エラーイベントを送信
          publishEvent(IpcChannels.REVIEW_EXECUTE_FINISHED, errorResult);
        });
      return {
        success: true,
      };
    } catch (error) {
      logger.error(error, 'レビュー実行処理に失敗しました');
      const err = normalizeUnknownError(error);
      const errorMessage = err.message;
      const errorResult = {
        success: false,
        error: errorMessage,
      };
      const payloadResult = {
        status: 'failed' as ReviewExecutionResultStatus,
        error: errorMessage,
      };

      // エラーイベントを送信
      publishEvent(IpcChannels.REVIEW_EXECUTE_FINISHED, payloadResult);

      return errorResult;
    }
  }

  /**
   * チェックリスト抽出処理をキャンセル
   * @param reviewHistoryId レビュー履歴ID
   */
  public abortExtractChecklist(reviewHistoryId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const runningWorkflow = this.runningWorkflows.get(reviewHistoryId);
      if (runningWorkflow) {
        runningWorkflow.cancel();
        this.runningWorkflows.delete(reviewHistoryId);
        logger.info(
          `チェックリスト抽出処理をキャンセルしました: ${reviewHistoryId}`,
        );
        return { success: true };
      } else {
        logger.warn(
          `キャンセル対象のチェックリスト抽出処理が見つかりません: ${reviewHistoryId}`,
        );
        return {
          success: false,
          error: 'キャンセル対象の処理が見つかりません',
        };
      }
    } catch (error) {
      logger.error(error, 'チェックリスト抽出のキャンセルに失敗しました');
      const err = normalizeUnknownError(error);
      return { success: false, error: err.message };
    }
  }

  /**
   * レビュー実行処理をキャンセル
   * @param reviewHistoryId レビュー履歴ID
   */
  public abortExecuteReview(reviewHistoryId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const runningWorkflow = this.runningWorkflows.get(reviewHistoryId);
      if (runningWorkflow) {
        runningWorkflow.cancel();
        this.runningWorkflows.delete(reviewHistoryId);
        logger.info(`レビュー実行処理をキャンセルしました: ${reviewHistoryId}`);
        return { success: true };
      } else {
        logger.warn(
          `キャンセル対象のレビュー実行処理が見つかりません: ${reviewHistoryId}`,
        );
        return {
          success: false,
          error: 'キャンセル対象の処理が見つかりません',
        };
      }
    } catch (error) {
      logger.error(error, 'レビュー実行のキャンセルに失敗しました');
      const err = normalizeUnknownError(error);
      return { success: false, error: err.message };
    }
  }
}
