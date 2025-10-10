import { IpcChannels, IpcEventPayload } from '@/types';
import { invokeApi } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';
import { ElectronPushClient } from '../lib/ElectronPushClient';

export interface IReviewChatApi {
  streamResponse(callbacks: {
    onMessage: (
      chunk: IpcEventPayload<typeof IpcChannels.REVIEW_CHAT_STREAM_RESPONSE>,
    ) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  }): () => void;
  abortChat(
    reviewHistoryId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  sendMessage(
    reviewHistoryId: string,
    checklistIds: number[],
    question: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
}

// IPC通信を使用してレビューチャット機能を提供するAPIサービス
export class ReviewChatApi implements IReviewChatApi {
  // シングルトン変数
  private static instance: ReviewChatApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): ReviewChatApi {
    if (!ReviewChatApi.instance) {
      ReviewChatApi.instance = new ReviewChatApi();
    }
    return ReviewChatApi.instance;
  }

  /**
   * ストリーミング応答の購読
   * @param callbacks ストリーミングイベントのコールバック
   * @returns 購読解除用の関数
   */
  public streamResponse(callbacks: {
    onMessage: (
      chunk: IpcEventPayload<typeof IpcChannels.REVIEW_CHAT_STREAM_RESPONSE>,
    ) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  }): () => void {
    const pushClient = new ElectronPushClient();
    const abortController = new AbortController();

    // ストリーミングイベントの購読
    pushClient.subscribe(
      IpcChannels.REVIEW_CHAT_STREAM_RESPONSE,
      (event) => {
        callbacks.onMessage(event.payload);
      },
      { signal: abortController.signal },
    );

    // 完了イベント（レビューチャット専用）
    pushClient.subscribe(
      IpcChannels.REVIEW_CHAT_COMPLETE,
      () => {
        // 購読を解除
        abortController.abort();
        // 完了コールバックを呼び出し
        callbacks.onDone();
      },
      { signal: abortController.signal },
    );

    // エラーイベント（レビューチャット専用）
    pushClient.subscribe(
      IpcChannels.REVIEW_CHAT_ERROR,
      (event) => {
        // 購読を解除
        abortController.abort();
        // エラーコールバックを呼び出し
        callbacks.onError(
          new Error(event.payload.message || '予期せぬエラーが発生しました'),
        );
      },
      { signal: abortController.signal },
    );

    // 購読解除のためのクリーンアップ
    return () => {
      abortController.abort();
    };
  }

  /**
   * レビューチャットの中断
   * @param reviewHistoryId レビュー履歴ID
   * @param options APIサービスのオプション
   */
  public async abortChat(
    reviewHistoryId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () => window.electron.review.abortChat(reviewHistoryId),
      options,
    );
  }

  /**
   * レビューチャットメッセージ送信
   * @param reviewHistoryId レビュー履歴ID
   * @param checklistIds チェックリストID配列
   * @param question ユーザからの質問
   * @param options APIサービスのオプション
   */
  public async sendMessage(
    reviewHistoryId: string,
    checklistIds: number[],
    question: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () =>
        window.electron.review.sendChatMessage({
          reviewHistoryId,
          checklistIds,
          question,
        }),
      options,
    );
  }
}
