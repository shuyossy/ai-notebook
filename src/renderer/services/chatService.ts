import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ChatRoom } from '../../shared/types/base';

// IPC通信を使用してメインプロセスのAIエージェントへメッセージを送信するためのチャットサービス
export const chatService = {
  /**
   * チャットルーム一覧を取得
   * @returns チャットルーム配列
   */
  getChatRooms: async (): Promise<ChatRoom[]> => {
    try {
      // IPCを使用してメインプロセスから取得
      const rooms = await window.electron.chat.getRooms();
      return rooms || [];
    } catch (error) {
      console.error('チャットルーム一覧の取得に失敗しました:', error);
      return [];
    }
  },

  /**
   * チャットルームを削除
   * @param roomId チャットルームID
   */
  deleteChatRoom: async (roomId: string): Promise<void> => {
    try {
      // IPCを使用してメインプロセスから削除
      await window.electron.chat.deleteRoom(roomId);
    } catch (error) {
      console.error('チャットルームの削除に失敗しました:', error);
      throw error;
    }
  },

  /**
   * 特定のチャットルームのメッセージ履歴を取得
   * @param roomId チャットルームID
   * @returns メッセージ配列
   */
  getChatMessages: async (roomId: string): Promise<ChatMessage[]> => {
    try {
      // IPCを使用してメインプロセスから取得
      const messages = await window.electron.chat.getMessages(roomId);
      return messages || [];
    } catch (error) {
      console.error('チャットメッセージの取得に失敗しました:', error);
      return [];
    }
  },

  /**
   * チャットメッセージを送信
   * @param roomId チャットルームID
   * @param content メッセージ内容
   * @returns 送信結果
   */
  sendMessage: (roomId: string, content: string): ChatMessage => {
    // ユーザーメッセージを作成
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      createdAt: new Date(),
    };

    try {
      // このメソッドではメッセージ送信の開始だけを行い、
      // 実際の応答はstreamResponseメソッドで非同期に取得する
      window.electron.chat.sendMessage(roomId, content);
      return userMessage;
    } catch (error) {
      console.error('メッセージの送信に失敗しました:', error);
      throw error;
    }
  },

  /**
   * ストリーミングでAIからの応答を取得
   * @param callbacks コールバック関数群
   */
  streamResponse: (callbacks: {
    onMessage: (chunk: string) => void;
    onDone: () => void;
    onError: (error: Error) => void;
  }): (() => void) => {
    // ストリーミングイベントの購読
    const unsubscribeStream = window.electron.chat.onStream((chunk) => {
      callbacks.onMessage(chunk);
    });

    // ツール実行ステップイベントの購読
    const unsubscribeStep = window.electron.chat.onStep((step) => {
      // 必要に応じてステップ情報を処理
      console.log('ツール実行ステップ:', step);
    });

    // 完了イベントの購読
    const unsubscribeComplete = window.electron.chat.onComplete(
      // eslint-disable-next-line
      ({ text, finishReason }) => {
        // 購読を解除
        unsubscribeStream();
        unsubscribeStep();
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
      unsubscribeStep();
      unsubscribeComplete();
      unsubscribeError();

      // エラーコールバックを呼び出し
      callbacks.onError(
        new Error(error.message || '不明なエラーが発生しました'),
      );
    });
    // 購読解除のためのクリーンアップ
    return () => {
      unsubscribeStream();
      unsubscribeStep();
      unsubscribeComplete();
      unsubscribeError();
    };
  },
};

export default chatService;
