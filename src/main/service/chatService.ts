// @ts-ignore
import { MastraMemory, StorageThreadType } from '@mastra/core';
// @ts-ignore
import { MastraError } from '@mastra/core/error';
import { APICallError, Message, UIMessage, createDataStream } from 'ai';
import { mastra } from '@/mastra';
import { AppError, internalError } from '../lib/error';
import { AbortControllerManager } from '../lib/AbortControllerManager';
import { judgeFinishReason } from '@/mastra/lib/agentUtils';
import { ChatMessage, IpcChannels } from '@/types';
import { getMainLogger } from '../lib/logger';
import { formatMessage } from '../lib/messages';
import { SettingsService } from './settingsService';

const logger = getMainLogger();

export interface IChatService {
  getThreadList(userId: string): Promise<StorageThreadType[]>;
  deleteThread(userId: string, threadId: string): Promise<void>;
  createThread(userId: string, threadId: string, title: string): Promise<void>;
  abortGeneration(userId: string, threadId: string): void;
  deleteMessagesBeforeSpecificId(
    threadId: string,
    messageId: string,
  ): Promise<void>;
  generate(
    userId: string,
    threadId: string,
    messages: Message[],
    event: Electron.IpcMainInvokeEvent,
  ): Promise<ReturnType<typeof createDataStream>>;

  getOrCreateAbortController(userId: string, threadId: string): AbortController;
  deleteAbortController(userId: string, threadId: string): void;
  getThreadMessages(threadId: string): Promise<UIMessage[]>;
}

export class ChatService implements IChatService {
  // シングルトン変数
  private static instance: ChatService;

  // スレッドごとのAbortControllerを管理するMap
  private abortControllerManager = AbortControllerManager.getInstance();

  private orchestratorAgent = mastra.getAgent('orchestrator');

  private settingsService = SettingsService.getInstance();

  // シングルトンインスタンスを取得
  public static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  private async getMemory(): Promise<MastraMemory> {
    const memory = await mastra.getMemory();
    if (!memory) {
      throw internalError({
        expose: true,
        messageCode: 'MASTRA_MEMORY_ERROR',
      });
    }
    return memory;
  }

  /**
   * スレッド一覧を取得する
   */
  public async getThreadList(userId: string): Promise<StorageThreadType[]> {
    // メモリからスレッド一覧を取得
    const memory = await this.getMemory();
    const threads = await memory.getThreadsByResourceId({
      resourceId: userId,
    });
    return threads;
  }

  /**
   * スレッドを削除する
   * @param threadId スレッドID
   */
  public async deleteThread(userId: string, threadId: string): Promise<void> {
    // スレッドのAbortControllerを削除
    this.deleteAbortController(userId, threadId);

    const memory = await this.getMemory();

    // メモリからスレッドを削除
    await memory.storage.deleteThread({ threadId });
  }

  /**
   * スレッドを作成する
   * @param threadId スレッドID
   * @param title スレッドのタイトル
   * @returns 作成したスレッド
   */
  public async createThread(
    userId: string,
    threadId: string,
    title: string,
  ): Promise<void> {
    const memory = await this.getMemory();
    await memory.createThread({
      resourceId: userId,
      title,
      threadId,
    });
  }

  public abortGeneration(userId: string, threadId: string): void {
    const controller = this.getOrCreateAbortController(userId, threadId);
    controller.abort();
    this.deleteAbortController(userId, threadId);
  }

  public async generate(
    userId: string,
    threadId: string,
    messages: ChatMessage[],
    event: Electron.IpcMainInvokeEvent,
  ) {
    // 新しいAbortControllerを作成
    const controller = this.abortControllerManager.getOrCreateAbortController(
      userId,
      threadId,
    );

    const orchestratorAgent = mastra.getAgent('orchestrator');

    // runtimeContextを作成
    const runtimeContext = await this.settingsService.getRuntimeContext();

    // 利用ツールの取得
    const toolsets = await this.settingsService.getToolsets();

    // メッセージをストリーミングで送信
    // const stream = await orchestratorAgent.stream(content, {
    //   resourceId: 'user', // 固定のリソースID
    //   toolCallStreaming: true,
    //   instructions: await getOrchestratorSystemPrompt(
    //     mastraStatus.tools ?? {
    //       redmine: false,
    //       gitlab: false,
    //       mcp: false,
    //     },
    //   ),
    //   threadId: roomId, // チャットルームIDをスレッドIDとして使用
    //   maxSteps: 30, // ツールの利用上限
    //   onFinish: () => {
    //     // ストリーミングが完了したときの処理
    //     // フロントエンドに完了通知を送信
    //     event.sender.send(IpcChannels.CHAT_COMPLETE);
    //   },
    // });

    // // DataStreamを生成
    // const dataStream = createDataStream({
    //   execute(writer) {
    //     stream.mergeIntoDataStream(writer);
    //   },
    //   onError(error) {
    //     // エラーが発生したときの処理
    //     console.error('ストリーミング中にエラーが発生:', error);
    //     if (error == null) return 'unknown error';
    //     if (typeof error === 'string') return error;
    //     if (error instanceof Error) return error.message;
    //     return JSON.stringify(error);
    //   },
    // });

    // DataStreamを生成
    const dataStream = createDataStream({
      execute: async (writer) => {
        // ストリーミングの開始を通知（このデータは利用されない、あくまで通知するためだけ）
        writer.writeMessageAnnotation({
          type: 'status',
          value: 'processing',
        });
        // streaming falseの場合のメッセージ送信処理
        const res = await orchestratorAgent.generate(messages, {
          runtimeContext,
          toolsets,
          resourceId: userId,
          threadId, // チャットルームIDをスレッドIDとして使用
          maxSteps: 30, // ツールの利用上限
          abortSignal: controller.signal, // 中断シグナルを設定
          onStepFinish: (stepResult) => {
            // https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
            // 上記を参考にai-sdkのストリームプロトコルに従ってメッセージを送信
            writer.write(`0:${JSON.stringify(stepResult.text)}\n`);
            stepResult.toolCalls.forEach((toolCall) => {
              writer.write(`9:${JSON.stringify(toolCall)}\n`);
            });
            stepResult.toolResults.forEach((toolResult) => {
              writer.write(`a:${JSON.stringify(toolResult)}\n`);
            });
            writer.write(
              `e:${JSON.stringify({ finishReason: stepResult.finishReason, ...stepResult.usage })}\n`,
            );
          },
        });
        const { success, reason } = judgeFinishReason(res.finishReason);
        if (!success) {
          // 正常終了でない場合はエラーを投げる
          throw internalError({
            expose: true,
            messageCode: 'CHAT_GENERATE_ERROR',
            messageParams: { reason },
          });
        }
        writer.write(
          `d:${JSON.stringify({ finishReason: res.finishReason, ...res.usage })}\n`,
        );
        event.sender.send(IpcChannels.CHAT_COMPLETE);
        // 処理が完了したらAbortControllerを削除
        this.abortControllerManager.deleteAbortController(userId, threadId);
      },
      onError: (error) => {
        // エラーが発生したときの処理
        logger.error(error, 'テキスト生成中にエラーが発生');
        // エラー時もAbortControllerを削除
        this.deleteAbortController(userId, threadId);
        let errorDetail = '不明なエラー';
        if (
          error instanceof MastraError &&
          APICallError.isInstance(error.cause)
        ) {
          // APIコールエラーの場合はresponseBodyの内容を取得
          errorDetail = error.cause.message;
          // if (error.cause.responseBody) {
          //   errorDetail += `:\n${error.cause.responseBody}`;
          // }
        } else if (error instanceof AppError) {
          return error.message;
        }
        return formatMessage('CHAT_GENERATE_ERROR', {
          detail: errorDetail,
        });
      },
    });
    return dataStream;
  }

  /**
   * スレッドのAbortControllerを取得または作成する
   * @param threadId スレッドID
   * @returns AbortController
   */
  public getOrCreateAbortController(
    userId: string,
    threadId: string,
  ): AbortController {
    return this.abortControllerManager.getOrCreateAbortController(
      userId,
      threadId,
    );
  }

  /**
   * スレッドのAbortControllerを削除する
   * @param threadId スレッドID
   */
  public deleteAbortController(userId: string, threadId: string): void {
    this.abortControllerManager.deleteAbortController(userId, threadId);
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
    const memory = await this.getMemory();
    const messages = await memory.storage.getMessages({
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
    await memory.storage.deleteThread({ threadId });

    // スレッドを再作成
    // await this.memory.createThread({
    //   resourceId: 'user',
    //   title: '',
    //   threadId,
    // });

    // 取得した履歴をメモリに保存
    await memory.saveMessages({
      messages: history,
      memoryConfig: undefined,
    });
  }

  /**
   * スレッドのメッセージを取得する
   * @param threadId スレッドID
   */
  public async getThreadMessages(threadId: string): Promise<UIMessage[]> {
    const memory = await this.getMemory();
    const result = await memory.query({ threadId });
    if (!result) {
      return [];
    }
    return result.uiMessages;
  }
}
