import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ChatRoom } from '../types';

// モックのチャットルーム
const mockChatRooms: ChatRoom[] = [
  {
    id: uuidv4(),
    title: 'サンプルチャット1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// モックのチャットメッセージ
let mockChatMessages: ChatMessage[] = [];

// IPC通信を使用してメインプロセスのAIエージェントへメッセージを送信するためのチャットサービス
export const chatService = {
  /**
   * チャットルーム一覧を取得
   * @returns チャットルーム配列
   */
  getChatRooms: async (): Promise<ChatRoom[]> => {
    // 実際にはIPCを使用してメインプロセスから取得する
    return mockChatRooms;
  },

  /**
   * 新しいチャットルームを作成
   * @param title チャットルームのタイトル
   * @returns 作成されたチャットルーム
   */
  createChatRoom: async (title: string): Promise<ChatRoom> => {
    const newRoom: ChatRoom = {
      id: uuidv4(),
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockChatRooms.push(newRoom);
    return newRoom;
  },

  /**
   * チャットルームを削除
   * @param roomId チャットルームID
   */
  deleteChatRoom: async (roomId: string): Promise<void> => {
    const index = mockChatRooms.findIndex((room) => room.id === roomId);
    if (index !== -1) {
      mockChatRooms.splice(index, 1);
      // チャットルームに関連するメッセージも削除
      mockChatMessages = mockChatMessages.filter(
        (message) => message.roomId !== roomId,
      );
    }
  },

  /**
   * 特定のチャットルームのメッセージ履歴を取得
   * @param roomId チャットルームID
   * @returns メッセージ配列
   */
  getChatMessages: async (roomId: string): Promise<ChatMessage[]> => {
    return mockChatMessages.filter((message) => message.roomId === roomId);
  },

  /**
   * チャットメッセージを送信
   * @param roomId チャットルームID
   * @param content メッセージ内容
   * @returns 送信結果
   */
  sendMessage: async (
    roomId: string,
    content: string,
  ): Promise<ChatMessage> => {
    // ユーザーメッセージを保存
    const userMessage: ChatMessage = {
      id: uuidv4(),
      roomId,
      role: 'user',
      content,
      createdAt: new Date(),
    };
    mockChatMessages.push(userMessage);

    // ここでメインプロセスへのIPC通信が行われる（実際の実装時）
    // 今はモックとして簡単な応答を返す
    return userMessage;
  },

  /**
   * ストリーミングでAIからの応答を取得
   * @param roomId チャットルームID
   * @param userMessageId ユーザーメッセージID
   * @param callbacks コールバック関数群
   */
  streamResponse: async (
    roomId: string,
    userMessageId: string,
    callbacks: {
      onMessage: (chunk: string) => void;
      onDone: (message: ChatMessage) => void;
      onError: (error: Error) => void;
    },
  ): Promise<void> => {
    try {
      // モックのストリーミング応答（実際にはIPCでイベントリスナーを設定する）
      const fullResponse =
        'これはAIエージェントからのモック応答です。実際の実装ではMastraエージェントとの対話が行われます。';

      // 応答をストリーミングするシミュレーション
      let accumulated = '';
      const words = fullResponse.split(' ');

      for (const word of words) {
        accumulated += word + ' ';
        callbacks.onMessage(accumulated);
        // 単語ごとに少し待機してストリーミングを模倣
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 完了時にメッセージを保存
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        roomId,
        role: 'assistant',
        content: fullResponse,
        createdAt: new Date(),
      };
      mockChatMessages.push(assistantMessage);

      callbacks.onDone(assistantMessage);
    } catch (error) {
      callbacks.onError(error as Error);
    }
  },
};

export default chatService;
