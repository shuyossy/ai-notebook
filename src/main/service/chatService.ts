import { MastraMemory, StorageThreadType } from '@mastra/core';
import { UIMessage } from 'ai';
import { getSourceRepository } from '../../db/repository/sourceRepository';

export class ChatService {
  private sourceRepository = getSourceRepository();

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
  public async deleteMessagesAfter(
    threadId: string,
    oldContent: string,
    oldCreatedAt: Date,
  ): Promise<void> {
    // メッセージ履歴を取得
    const messages = await this.memory.storage.getMessages({
      threadId,
    });

    // oldContentと一致するメッセージのリストを取得
    const targetMessages = messages.filter((msg) => {
      if (msg.role !== 'user') {
        return false; // ユーザーメッセージのみを対象とする
      }
      if (typeof msg.content === 'string') {
        return msg.content === oldContent; // 文字列の場合は直接比較
      }
      return (
        // textパートは一つのみのはずなので、最初のtextパートを取得して比較
        msg.content.filter((c) => c.type === 'text')[0].text === oldContent
      );
    });

    if (targetMessages.length === 0) {
      throw new Error('指定されたメッセージが見つかりません');
    }

    // 取得したメッセージリストからoldCreatedAtと最も近いメッセージを検索
    const targetMessage = targetMessages.reduce((closest, current) => {
      const currentDate = new Date(current.createdAt);
      const closestDate = new Date(closest.createdAt);
      return Math.abs(currentDate.getTime() - oldCreatedAt.getTime()) <
        Math.abs(closestDate.getTime() - oldCreatedAt.getTime())
        ? current
        : closest;
    });

    // messageIdに対応するメッセージを検索
    const targetMessageIndex = messages.findIndex(
      (msg) => msg.id === targetMessage.id,
    );
    if (targetMessageIndex === -1) {
      throw new Error(`メッセージID ${targetMessage.id} が見つかりません`);
    }
    // 最初のメッセージからmessageIdに対応するメッセージまでの履歴を取得
    const history = messages.slice(0, targetMessageIndex);
    console.log('new history:', history);

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
    const { uiMessages, messages } = result;

    try {
      // messages内の要素でroleが'user'の場合に、contentのtypeが'image'のものがあれば、画像データを対応するuiMessagesにも付与する
      messages.forEach((message) => {
        if (message.role === 'user' && typeof message.content !== 'string') {
          const imageAttachments = message.content
            .filter(
              (part) => part.type === 'image' && typeof part.image === 'string',
            )
            .map((part) => {
              return {
                // @ts-ignore partはImagePart型であることが保証されている
                url: part.image,
                // @ts-ignore partはImagePart型であることが保証されている
                contentType: part.mimeType,
              };
            });
          if (imageAttachments.length > 0) {
            // uiMessagesの対応するメッセージに画像データを追加
            const uiMessage = uiMessages.find(
              // @ts-ignore CoreMessageもダンプしてみるとidが存在する
              (uiMsg) => uiMsg.id === message.id,
            );
            if (uiMessage) {
              uiMessage.experimental_attachments = imageAttachments;
            } else {
              console.warn(
                // @ts-ignore
                `対応するUIメッセージが見つかりません: ${message.id}`,
              );
            }
          }
        }
      });
    } catch (error) {
      console.error('画像データの付与中にエラーが発生しました:', error);
    }
    return uiMessages;
  }
}
