import { ReviewChecklistResultDisplay, UploadFile,DocumentType, ReviewChecklistEdit } from '@/types';
import { ApiServiceDefaultOptions } from '../types';
import { getData } from '../lib/apiUtils';
import { ReviewHistory } from '@/db/schema';

export interface IReviewApi {
  getHistories(options?: ApiServiceDefaultOptions): Promise<ReviewHistory[] | null>;
  deleteHistory(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  getReviewHistoryDetail(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    checklistResults?: ReviewChecklistResultDisplay[];
  } | null>;
  getReviewInstruction(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    additionalInstructions?: string;
    commentFormat?: string;
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
    additionalInstructions?: string,
    commentFormat?: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  subscribeChecklistExtractionFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
  ): () => void;
  subscribeReviewExtractionFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
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
  ): Promise<ReviewHistory[] | null> {
    const result = await window.electron.review.getHistories();
    return getData(result, options);
  }

  public async deleteHistory(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.review.deleteHistory(historyId);
    getData(result, options);
  }

  public async getReviewHistoryDetail(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    checklistResults?: ReviewChecklistResultDisplay[];
  } | null> {
    const result = await window.electron.review.getHistoryDetail(historyId);
    const data = getData(result, options);
    return data;
  }

  public async getReviewInstruction(
    historyId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<{
    additionalInstructions?: string;
    commentFormat?: string;
  } | null> {
    const result = await window.electron.review.getHistoryInstruction(historyId);
    const data = getData(result, options);
    return data;
  }

  public async extractChecklist(
    historyId: string,
    files: UploadFile[],
    documentType?: DocumentType,
    checklistRequirements?: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.review.extractChecklist({
      reviewHistoryId: historyId,
      files,
      documentType,
      checklistRequirements,
    });
    getData(result, options);
  }

  public async executeReview(
    historyId: string,
    files: UploadFile[],
    additionalInstructions?: string,
    commentFormat?: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.review.execute({
      reviewHistoryId: historyId,
      files,
      additionalInstructions,
      commentFormat,
    });
    getData(result, options);
  }

  public subscribeChecklistExtractionFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
  ): () => void {
    const unsubscribe = window.electron.review.onExtractChecklistFinished(
      (payload) => {
        callback(payload);
      },
    );
    return unsubscribe;
  }

  public subscribeReviewExtractionFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
  ): () => void {
    const unsubscribe = window.electron.review.onExecuteReviewFinished(
      (payload) => {
        callback(payload);
      },
    );
    return unsubscribe;
  }

  public async updateChecklist(
    historyId: string,
    checklistEdits: ReviewChecklistEdit[],
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.review.updateChecklist({
      reviewHistoryId: historyId,
      checklistEdits,
    });
    getData(result, options);
  }
}
