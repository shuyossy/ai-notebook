import { MastraMemory, StorageThreadType } from '@mastra/core';
import { UIMessage } from 'ai';

export class ChatService {
  // スレッドごとのAbortControllerを管理するMap
  private threadAbortControllers = new Map<string, AbortController>();

  // mastraメモリのインスタンスを保持（チャットメッセージが保存されてあるメモリ）
  private memory: MastraMemory;

  constructor(memory: MastraMemory) {
    this.memory = memory;
  }

  /**
   * スレッド一覧を取得する
   */
  public async getThreadList(userId: string): Promise<StorageThreadType[]> {
    // メモリからスレッド一覧を取得
    const threads = await this.memory.getThreadsByResourceId({
      resourceId: userId,
    });
    return threads;
  }

  /**
   * スレッドを削除する
   * @param threadId スレッドID
   */
  public async deleteThread(threadId: string): Promise<void> {
    // スレッドのAbortControllerを削除
    this.deleteAbortController(threadId);

    // メモリからスレッドを削除
    await this.memory.storage.deleteThread({ threadId });
  }

  /**
   * スレッドを作成する
   * @param threadId スレッドID
   * @param title スレッドのタイトル
   * @returns 作成したスレッド
   */
  public async createThread(
    threadId: string,
    title: string,
    userId: string,
  ): Promise<void> {
    await this.memory.createThread({
      resourceId: userId,
      title,
      threadId,
    });
  }

  /**
   * スレッドのAbortControllerを取得または作成する
   * @param threadId スレッドID
   * @returns AbortController
   */
  public getOrCreateAbortController(threadId: string): AbortController {
    if (!this.threadAbortControllers.has(threadId)) {
      const controller = new AbortController();
      this.threadAbortControllers.set(threadId, controller);
    }
    return this.threadAbortControllers.get(threadId)!;
  }

  /**
   * スレッドのAbortControllerを削除する
   * @param threadId スレッドID
   */
  public deleteAbortController(threadId: string): void {
    if (this.threadAbortControllers.has(threadId)) {
      this.threadAbortControllers.get(threadId)?.abort();
      this.threadAbortControllers.delete(threadId);
    }
  }

  /**
   * スレッド内の指定されたメッセージ以降の全てのメッセージを削除する
   * @param threadId スレッドID
   * @param oldContent 削除するメッセージのコンテンツ
   * @param oldCreatedAt 削除するメッセージの作成日時
   */
  public async deleteMessagesBeforeSpecificId(
    threadId: string,
    messageId: string,
  ): Promise<void> {
    // メッセージ履歴を取得
    const messages = await this.memory.storage.getMessages({
      threadId,
    });

    // messageIdに対応するメッセージを検索
    const targetMessageIndex = messages.findIndex(
      (msg) => msg.id === messageId,
    );
    if (targetMessageIndex === -1) {
      throw new Error(`メッセージが見つかりません`);
    }
    // 最初のメッセージからmessageIdに対応するメッセージまでの履歴を取得
    const history = messages.slice(0, targetMessageIndex);

    // スレッドを削除
    await this.memory.storage.deleteThread({ threadId });

    // スレッドを再作成
    // await this.memory.createThread({
    //   resourceId: 'user',
    //   title: '',
    //   threadId,
    // });

    // 取得した履歴をメモリに保存
    await this.memory.saveMessages({
      messages: history,
      memoryConfig: undefined,
    });
  }

  /**
   * スレッドのメッセージを取得する
   * @param threadId スレッドID
   */
  public async getThreadMessages(threadId: string): Promise<UIMessage[]> {
    const result = await this.memory.query({ threadId });
    if (!result) {
      return [];
    }
    return result.uiMessages;
  }
}
