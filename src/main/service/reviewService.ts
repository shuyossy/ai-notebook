import { createDataStream } from 'ai';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { getReviewRepository } from '@/adapter/db';
import {
  ReviewChecklistEdit,
  ReviewChecklistResult,
  CustomEvaluationSettings,
  UploadFile,
  IpcChannels,
  DocumentType,
  ChecklistExtractionResultStatus,
  ReviewExecutionResultStatus,
  DocumentMode,
} from '@/types';
import { generateReviewTitle } from '@/mastra/workflows/sourceReview/lib';
import { RevieHistory } from '@/types';
import FileExtractor from '@/main/lib/fileExtractor';
import { CsvParser } from '@/main/lib/csvParser';
import { publishEvent } from '../lib/eventPayloadHelper';
import { internalError, normalizeUnknownError, toPayload } from '../lib/error';
import { getMainLogger } from '../lib/logger';
import { mastra } from '@/mastra';
import { checkWorkflowResult } from '@/mastra/lib/workflowUtils';
import { formatMessage } from '../lib/messages';
import { ReviewCacheHelper } from '@/main/lib/utils/reviewCacheHelper';
import { ReviewChatWorkflowRuntimeContext } from '@/mastra/workflows/reviewChat';

export interface IReviewService {
  getReviewHistories(): Promise<RevieHistory[]>;
  getReviewHistoryDetail(reviewHistoryId: string): Promise<{
    checklistResults: ReviewChecklistResult[];
    targetDocumentName?: string | null;
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
  chatWithReview(
    reviewHistoryId: string,
    checklistIds: number[],
    question: string,
  ): Promise<ReturnType<typeof createDataStream>>;
  abortReviewChat(reviewHistoryId: string): {
    success: boolean;
    error?: string;
  };
}

const logger = getMainLogger();
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

  private reviewRepository = getReviewRepository();

  // 実行中のワークフロー管理
  private runningWorkflows = new Map<string, { cancel: () => void }>();

  /**
   * レビュー履歴一覧を取得
   */
  public async getReviewHistories() {
    return this.reviewRepository.getAllReviewHistories();
  }

  /**
   * レビュー履歴の詳細（チェックリスト結果）を取得
   */
  public async getReviewHistoryDetail(reviewHistoryId: string) {
    const checklistResults =
      await this.reviewRepository.getReviewChecklistResults(reviewHistoryId);
    const reviewHistory =
      await this.reviewRepository.getReviewHistory(reviewHistoryId);
    return {
      checklistResults: checklistResults,
      targetDocumentName: reviewHistory?.targetDocumentName,
    };
  }

  /**
   * レビュー履歴の追加指示、コメントフォーマット、評定項目設定を取得
   */
  public async getReviewInstruction(reviewHistoryId: string) {
    const reviewHistory =
      await this.reviewRepository.getReviewHistory(reviewHistoryId);
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
    await this.reviewRepository.deleteReviewHistory(reviewHistoryId);

    // キャッシュディレクトリも削除
    try {
      await ReviewCacheHelper.deleteCacheDirectory(reviewHistoryId);
    } catch (err) {
      // キャッシュ削除失敗はログのみ（DB削除は成功しているため）
      logger.warn(
        err,
        `キャッシュディレクトリの削除に失敗しました: ${reviewHistoryId}`,
      );
    }
  }

  /**
   * チェックリストを更新
   */
  public async updateChecklists(
    reviewHistoryId: string,
    checklistEdits: ReviewChecklistEdit[],
  ) {
    // レビュー履歴が存在しない場合は新規作成
    let reviewHistory =
      await this.reviewRepository.getReviewHistory(reviewHistoryId);
    if (reviewHistory === null) {
      reviewHistory = await this.reviewRepository.createReviewHistory(
        generateReviewTitle(),
        reviewHistoryId,
      );
      // 新規作成時はレビュー履歴更新イベントを送信
      publishEvent(IpcChannels.REVIEW_HISTORY_UPDATED, undefined);
    }

    // チェックリストの編集を実行
    // 現状は一度に一つのチェックリスト編集しか行わない（checklistEditsの要素数は1つ）の想定なので、トランザクション制御などは行わない
    for (const edit of checklistEdits) {
      if (edit.id === null) {
        // 新規作成
        if (edit.content) {
          await this.reviewRepository.createChecklist(
            reviewHistoryId,
            edit.content,
            'user',
          );
        }
      } else if (edit.delete) {
        // 削除
        await this.reviewRepository.deleteChecklist(edit.id);
      } else if (edit.content) {
        // 更新
        await this.reviewRepository.updateChecklist(edit.id, edit.content);
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
    return this.reviewRepository.updateReviewHistoryAdditionalInstructionsAndCommentFormat(
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
    return this.reviewRepository.updateReviewHistoryEvaluationSettings(
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
        await this.reviewRepository.getReviewHistory(reviewHistoryId);
      if (reviewHistory === null) {
        reviewHistory = await this.reviewRepository.createReviewHistory(
          generateReviewTitle(),
          reviewHistoryId,
        );
        // 新規作成時はレビュー履歴更新イベントを送信
        publishEvent(IpcChannels.REVIEW_HISTORY_UPDATED, undefined);
      }

      // システム作成のチェックリストを削除（手動作成分は保持）
      await this.reviewRepository.deleteSystemCreatedChecklists(
        reviewHistoryId,
      );

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
        await this.reviewRepository.createChecklist(
          reviewHistoryId,
          item,
          'system',
        );
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

  /**
   * アップロードファイルからチェックリスト抽出処理を実行
   * @param reviewHistoryId レビュー履歴ID（新規の場合は生成）
   * @param files アップロードファイルの配列
   * @returns 処理結果
   */
  public async extractChecklist(
    reviewHistoryId: string,
    files: UploadFile[],
    documentType: DocumentType = 'checklist-ai',
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

      // 処理ステータスを「抽出中」に更新
      await this.reviewRepository.updateReviewHistoryProcessingStatus(
        reviewHistoryId,
        'extracting',
      );

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

      // 処理ステータスを更新
      const newStatus = checkResult.status === 'success' ? 'extracted' : 'idle';
      await this.reviewRepository.updateReviewHistoryProcessingStatus(
        reviewHistoryId,
        newStatus,
      );

      return {
        status: checkResult.status,
        error: checkResult.errorMessage,
      };
    } catch (error) {
      logger.error(error, 'チェックリスト抽出処理に失敗しました');

      // エラー時もクリーンアップ
      this.runningWorkflows.delete(reviewHistoryId);

      // 処理ステータスを「アイドル」に戻す
      try {
        await this.reviewRepository.updateReviewHistoryProcessingStatus(
          reviewHistoryId,
          'idle',
        );
      } catch (statusUpdateError) {
        logger.error(statusUpdateError, '処理ステータスの更新に失敗しました');
      }

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
    documentMode?: DocumentMode,
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
      const workflow = mastra.getWorkflow('executeReviewWorkflow');

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

      // 処理ステータスを「レビュー中」に更新
      await this.reviewRepository.updateReviewHistoryProcessingStatus(
        reviewHistoryId,
        'reviewing',
      );

      const result = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          evaluationSettings,
          additionalInstructions,
          commentFormat,
          documentMode: documentMode || 'small', // デフォルトは少量ドキュメント
        },
      });

      // 結果を確認
      const checkResult = checkWorkflowResult(result);

      // クリーンアップ
      this.runningWorkflows.delete(reviewHistoryId);

      // 処理ステータスを更新
      const newStatus =
        checkResult.status === 'success' ? 'completed' : 'extracted';
      await this.reviewRepository.updateReviewHistoryProcessingStatus(
        reviewHistoryId,
        newStatus,
      );

      return {
        status: checkResult.status,
        error: checkResult.errorMessage,
      };
    } catch (error) {
      logger.error(error, 'レビュー実行処理に失敗しました');

      // エラー時もクリーンアップ
      this.runningWorkflows.delete(reviewHistoryId);

      // 処理ステータスを「抽出完了」に戻す
      try {
        await this.reviewRepository.updateReviewHistoryProcessingStatus(
          reviewHistoryId,
          'extracted',
        );
      } catch (statusUpdateError) {
        logger.error(statusUpdateError, '処理ステータスの更新に失敗しました');
      }

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
    documentType: DocumentType = 'checklist-ai',
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
            reviewHistoryId,
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
          publishEvent(IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED, {
            reviewHistoryId,
            ...errorResult,
          });
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
        reviewHistoryId,
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
    documentMode?: DocumentMode,
  ): { success: boolean; error?: string } {
    try {
      this.executeReview(
        reviewHistoryId,
        files,
        evaluationSettings,
        additionalInstructions,
        commentFormat,
        documentMode,
      )
        .then((res) => {
          // 完了イベントを送信
          publishEvent(IpcChannels.REVIEW_EXECUTE_FINISHED, {
            reviewHistoryId,
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
          publishEvent(IpcChannels.REVIEW_EXECUTE_FINISHED, {
            reviewHistoryId,
            ...errorResult,
          });
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
        reviewHistoryId,
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

  /**
   * レビューチャット実行
   * @param reviewHistoryId レビュー履歴ID
   * @param checklistIds チェックリストID配列
   * @param question ユーザからの質問
   * @returns DataStream
   */
  public async chatWithReview(
    reviewHistoryId: string,
    checklistIds: number[],
    question: string,
  ): Promise<ReturnType<typeof createDataStream>> {
    // DataStreamを生成
    const dataStream = createDataStream({
      execute: async (writer) => {
        try {
          // Mastraワークフローを取得
          const workflow = mastra.getWorkflow('reviewChatWorkflow');

          if (!workflow) {
            logger.error('レビュー実行ワークフローが見つかりません');
            throw internalError({
              expose: false,
            });
          }

          // ランタイムコンテキストを作成
          const runtimeContext =
            new RuntimeContext<ReviewChatWorkflowRuntimeContext>();
          runtimeContext.set('dataStreamWriter', writer);

          const run = await workflow.createRunAsync();

          // workflowをrunningWorkflowsに登録
          const workflowKey = `chat_${reviewHistoryId}`;

          // 実行中のワークフローを管理
          this.runningWorkflows.set(workflowKey, {
            cancel: () => run.cancel(),
          });

          // ストリーミングはworkflow内部で実行されるため、ここでは結果を待つだけ
          const result = await run.start({
            inputData: {
              reviewHistoryId,
              checklistIds,
              question,
            },
            runtimeContext,
          });

          checkWorkflowResult(result);

          // 処理が完了したらworkflowを削除
          this.runningWorkflows.delete(workflowKey);
        } catch (error) {
          logger.error(error, 'レビューチャット実行に失敗しました');
          // エラー時もworkflowを削除
          this.runningWorkflows.delete(`chat_${reviewHistoryId}`);
          throw error;
        }
      },
      onError: (error) => {
        logger.error(error, 'レビューチャット中にエラーが発生');
        // エラー時もworkflowを削除
        this.runningWorkflows.delete(`chat_${reviewHistoryId}`);
        const normalizedError = normalizeUnknownError(error);
        return formatMessage('UNKNOWN_ERROR', {
          detail: normalizedError.message,
        });
      },
    });

    return dataStream;
  }

  /**
   * レビューチャット中断
   * @param reviewHistoryId レビュー履歴ID
   */
  public abortReviewChat(reviewHistoryId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const workflowKey = `chat_${reviewHistoryId}`;
      const runningWorkflow = this.runningWorkflows.get(workflowKey);
      if (runningWorkflow) {
        runningWorkflow.cancel();
        this.runningWorkflows.delete(workflowKey);
        logger.info(`レビューチャットをキャンセルしました: ${reviewHistoryId}`);
        return { success: true };
      } else {
        logger.warn(
          `キャンセル対象のレビューチャットが見つかりません: ${reviewHistoryId}`,
        );
        return {
          success: false,
          error: 'キャンセル対象の処理が見つかりません',
        };
      }
    } catch (error) {
      logger.error(error, 'レビューチャットのキャンセルに失敗しました');
      const err = normalizeUnknownError(error);
      return { success: false, error: err.message };
    }
  }
}
