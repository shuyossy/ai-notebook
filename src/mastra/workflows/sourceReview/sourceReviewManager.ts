import { IpcMainInvokeEvent } from 'electron';
import { getReviewRepository } from '../../../db/repository/reviewRepository';
import { getSourceRepository } from '../../../db/repository/sourceRepository';
import { getMastra } from '../../../main/main';
import {
  IpcChannels,
  IpcEventPayloadMap,
  IpcResponsePayloadMap,
} from '../../../main/types/ipc';
import { generateReviewTitle } from './lib';
import { ReviewHistory } from '../../../db/schema';

/**
 * ソースレビュー処理を管理するクラス
 */
export default class SourceReviewManager {
  // eslint-disable-next-line
  private static instance: SourceReviewManager | null = null;

  private reviewRepository = getReviewRepository();

  private sourceRepository = getSourceRepository();

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
   * チェックリスト抽出処理を実行
   * @param reviewHistoryId レビュー履歴ID（新規の場合は生成）
   * @param sourceIds ソースIDの配列
   * @returns 処理結果
   */
  public async extractChecklist(
    reviewHistoryId: string,
    sourceIds: number[],
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

      let success = false;
      let errorMessage;

      // Mastraワークフローを実行
      const mastra = getMastra();
      const workflow = mastra.getWorkflow('checklistExtractionWorkflow');

      if (!workflow) {
        return {
          success: false,
          error: 'チェックリスト抽出ワークフローが見つかりません',
        };
      }

      const run = workflow.createRun();
      const runResult = await run.start({
        triggerData: {
          reviewHistoryId,
          sourceIds,
        },
      });

      // 結果を確認
      const extractResult = runResult.results.checklistExtractionStep;
      switch (extractResult.status) {
        case 'success':
          if (extractResult.output?.status === 'success') {
            success = true;
          }
          if (extractResult.output?.status === 'failed') {
            success = false;
            errorMessage = extractResult.output.errorMessage;
          }
          break;
        case 'failed':
          success = false;
          errorMessage = extractResult.error;
          break;
        default:
          success = false;
          errorMessage = 'チェックリスト抽出処理が不明な状態で終了しました';
      }
      return {
        success,
        error: errorMessage,
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
   * レビュー実行処理を実行
   * @param reviewHistoryId レビュー履歴ID
   * @param sourceIds ソースIDの配列
   * @returns 処理結果
   */
  public async executeReview(
    reviewHistoryId: string,
    sourceIds: number[],
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

      let success = false;
      let errorMessage;

      // Mastraワークフローを実行
      const mastra = getMastra();
      const workflow = mastra.getWorkflow('reviewExecutionWorkflow');

      if (!workflow) {
        return {
          success: false,
          error: 'レビュー実行ワークフローが見つかりません',
        };
      }

      // タイトルの変更
      // 全てのソースを取得
      const sources = await this.sourceRepository.getSourcesByIds(sourceIds);
      const reviewTitle = generateReviewTitle(sources.map((s) => s.title));
      // レビュー履歴のタイトルを更新
      await this.reviewRepository.updateReviewHistoryTitle(
        reviewHistory.id,
        reviewTitle,
      );

      const run = workflow.createRun();
      const result = await run.start({
        triggerData: {
          reviewHistoryId,
          sourceIds,
        },
      });

      // 結果を確認
      for (const step of Object.values(result.results)) {
        switch (step.status) {
          case 'success':
            if (step.output?.status === 'success') {
              success = true;
            }
            if (step.output?.status === 'failed') {
              success = false;
              errorMessage = step.output.errorMessage;
            }
            break;
          case 'failed':
            success = false;
            errorMessage = step.error;
            break;
          default:
            success = false;
            errorMessage = 'レビュー実行処理が不明な状態で終了しました';
        }
        if (!success) {
          break; // 最初の失敗でループを抜ける
        }
      }
      return {
        success,
        error: errorMessage,
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
    sourceIds: number[],
    event: IpcMainInvokeEvent,
  ): IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL] {
    try {
      this.extractChecklist(reviewHistoryId, sourceIds)
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
    sourceIds: number[],
    event: IpcMainInvokeEvent,
  ): IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL] {
    try {
      this.executeReview(reviewHistoryId, sourceIds)
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
