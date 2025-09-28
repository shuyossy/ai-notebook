import {
  ReviewChecklistResult,
  UploadFile,
  DocumentType,
  ReviewChecklistEdit,
  ChecklistExtractionResultStatus,
  ReviewExecutionResultStatus,
  CustomEvaluationSettings,
  DocumentMode,
} from '@/types';
import { ApiServiceDefaultOptions } from '../types';
import { invokeApi } from '../lib/apiUtils';
import { RevieHistory } from '@/types';
import { ElectronPushClient } from '../lib/ElectronPushClient';
import { IpcChannels } from '@/types';

export interface IReviewApi {
  getHistories(
    options?: ApiServiceDefaultOptions,
  ): Promise<RevieHistory[] | null>;
  deleteHistory(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  getReviewHistoryDetail(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    checklistResults?: ReviewChecklistResult[];
  } | null>;
  getReviewInstruction(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    additionalInstructions?: string;
    commentFormat?: string;
    evaluationSettings?: CustomEvaluationSettings;
  } | null>;
  extractChecklist(
    historyId: string,
    files: UploadFile[],
    documentType?: DocumentType,
    checklistRequirements?: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  executeReview(
    historyId: string,
    files: UploadFile[],
    evaluationSettings: CustomEvaluationSettings,
    documentMode: DocumentMode,
    additionalInstructions?: string,
    commentFormat?: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  subscribeChecklistExtractionFinished(
    callback: (payload: {
      reviewHistoryId: string;
      status: ChecklistExtractionResultStatus;
      error?: string;
    }) => void,
  ): () => void;
  subscribeReviewExtractionFinished(
    callback: (payload: {
      reviewHistoryId: string;
      status: ReviewExecutionResultStatus;
      error?: string;
    }) => void,
  ): () => void;
  updateChecklist(
    historyId: string,
    checklistEdits: ReviewChecklistEdit[],
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
}

export class ReviewApi implements IReviewApi {
  // シングルトン変数
  private static instance: ReviewApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): ReviewApi {
    if (!ReviewApi.instance) {
      ReviewApi.instance = new ReviewApi();
    }
    return ReviewApi.instance;
  }

  public async getHistories(
    options?: ApiServiceDefaultOptions,
  ): Promise<RevieHistory[] | null> {
    return invokeApi(() => window.electron.review.getHistories(), options);
  }

  public async deleteHistory(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () => window.electron.review.deleteHistory(historyId),
      options,
    );
  }

  public async getReviewHistoryDetail(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    checklistResults?: ReviewChecklistResult[];
  } | null> {
    return invokeApi(
      () => window.electron.review.getHistoryDetail(historyId),
      options,
    );
  }

  public async getReviewInstruction(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    additionalInstructions?: string;
    commentFormat?: string;
    evaluationSettings?: CustomEvaluationSettings;
  } | null> {
    return invokeApi(
      () => window.electron.review.getHistoryInstruction(historyId),
      options,
    );
  }

  public async extractChecklist(
    historyId: string,
    files: UploadFile[],
    documentType?: DocumentType,
    checklistRequirements?: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () =>
        window.electron.review.extractChecklist({
          reviewHistoryId: historyId,
          files,
          documentType,
          checklistRequirements,
        }),
      options,
    );
  }

  public async executeReview(
    historyId: string,
    files: UploadFile[],
    evaluationSettings: CustomEvaluationSettings,
    documentMode?: DocumentMode,
    additionalInstructions?: string,
    commentFormat?: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () =>
        window.electron.review.execute({
          reviewHistoryId: historyId,
          files,
          additionalInstructions,
          commentFormat,
          evaluationSettings,
          documentMode: documentMode ? documentMode : 'small',
        }),
      options,
    );
  }

  /**
   * チェックリスト抽出処理をキャンセル
   * @param reviewHistoryId レビュー履歴ID
   * @param options API オプション
   */
  public async abortExtractChecklist(
    reviewHistoryId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () => window.electron.review.abortExtractChecklist(reviewHistoryId),
      options,
    );
  }

  /**
   * レビュー実行処理をキャンセル
   * @param reviewHistoryId レビュー履歴ID
   * @param options API オプション
   */
  public async abortExecuteReview(
    reviewHistoryId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () => window.electron.review.abortExecute(reviewHistoryId),
      options,
    );
  }

  public subscribeChecklistExtractionFinished(
    callback: (payload: {
      reviewHistoryId: string;
      status: ChecklistExtractionResultStatus;
      error?: string;
    }) => void,
  ): () => void {
    const pushClient = new ElectronPushClient();
    return pushClient.subscribe(
      IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
      (event) => {
        callback(event.payload);
      },
    );
  }

  public subscribeReviewExtractionFinished(
    callback: (payload: {
      reviewHistoryId: string;
      status: ReviewExecutionResultStatus;
      error?: string;
    }) => void,
  ): () => void {
    const pushClient = new ElectronPushClient();
    return pushClient.subscribe(
      IpcChannels.REVIEW_EXECUTE_FINISHED,
      (event) => {
        callback(event.payload);
      },
    );
  }

  public async updateChecklist(
    historyId: string,
    checklistEdits: ReviewChecklistEdit[],
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () =>
        window.electron.review.updateChecklist({
          reviewHistoryId: historyId,
          checklistEdits,
        }),
      options,
    );
  }
}
