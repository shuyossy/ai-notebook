import { ChatMessage, ChatRoom, IpcChannels, IpcEventPayload } from '@/types';
import { getData } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';

export interface IChatApi {
  getChatRooms(options?: ApiServiceDefaultOptions): Promise<ChatRoom[] | null>;
  deleteChatRoom(
    roomId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  streamResponse(callbacks: {
    onMessage: (chunk: IpcEventPayload<typeof IpcChannels.CHAT_STREAM>) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  }): () => void;
  abortChatRequest(roomId: string, options?: ApiServiceDefaultOptions): void;
  getChatMessages(
    roomId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<ChatMessage[] | null>;
  createThread(
    roomId: string,
    title: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  sendMessage(
    roomId: string,
    messages: ChatMessage[],
    options?: ApiServiceDefaultOptions,
  ): void;
}

// IPC通信を使用してメインプロセスのAIエージェントへメッセージを送信するためのチャットサービス
export class ChatApi implements IChatApi {
  // シングルトン変数
  private static instance: ChatApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): ChatApi {
    if (!ChatApi.instance) {
      ChatApi.instance = new ChatApi();
    }
    return ChatApi.instance;
  }

  /**
   * チャットルーム一覧を取得
   * @returns チャットルーム配列
   */
  public async getChatRooms(
    options?: ApiServiceDefaultOptions,
  ): Promise<ChatRoom[] | null> {
    // IPCを使用してメインプロセスから取得
    const result = await window.electron.chat.getRooms();
    return getData(result, options);
  }

  /**
   * チャットルームを削除
   * @param roomId チャットルームID
   */
  public async deleteChatRoom(
    roomId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    // IPCを使用してメインプロセスから削除
    const result = await window.electron.chat.deleteRoom(roomId);
    getData(result, options);
  }

  public streamResponse(callbacks: {
    onMessage: (chunk: IpcEventPayload<typeof IpcChannels.CHAT_STREAM>) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  }): () => void {
    // ストリーミングイベントの購読
    const unsubscribeStream = window.electron.chat.onStream((chunk) => {
      callbacks.onMessage(chunk);
    });

    // 完了イベントの購読
    const unsubscribeComplete = window.electron.chat.onComplete(
      // eslint-disable-next-line
      () => {
        // 購読を解除
        unsubscribeStream();
        unsubscribeComplete();
        // eslint-disable-next-line
        unsubscribeError();

        // 完了コールバックを呼び出し
        callbacks.onDone();
      },
    );

    // エラーイベントの購読
    const unsubscribeError = window.electron.chat.onError((error) => {
      // 購読を解除
      unsubscribeStream();
      unsubscribeComplete();
      unsubscribeError();

      // エラーコールバックを呼び出し
      callbacks.onError(
        new Error(error.message || '予期せぬエラーが発生しました'),
      );
    });
    // 購読解除のためのクリーンアップ
    return () => {
      unsubscribeStream();
      unsubscribeComplete();
      unsubscribeError();
    };
  }

  public async abortChatRequest(
    roomId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.chat.requestAbort({
      threadId: roomId,
    });
    getData(result, options);
  }

  public async getChatMessages(
    roomId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<ChatMessage[] | null> {
    const result = await window.electron.chat.getMessages(roomId);
    return getData(result, options);
  }

  public async createThread(
    roomId: string,
    title: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.chat.createThread({ roomId, title });
    getData(result, options);
  }

  public async sendMessage(
    roomId: string,
    messages: ChatMessage[],
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.chat.sendMessage({ roomId, messages });
    getData(result, options);
    console.log('Message sent via IPC:', { roomId, messages });
  }
}
