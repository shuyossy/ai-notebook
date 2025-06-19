/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import fs from 'fs/promises';
import { app, BrowserWindow, shell, ipcMain, crashReporter } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import { createDataStream, APICallError, convertToCoreMessages } from 'ai';
import { eq } from 'drizzle-orm';
import {
  ReadableStream,
  WritableStream,
  TransformStream,
} from 'node:stream/web';
import { sourceRegistrationWorkflow } from '../mastra/workflows/sourceRegistration';
import { type Source } from '../db/schema';
import {
  IpcChannels,
  IpcResponsePayloadMap,
  IpcRequestPayloadMap,
} from './types/ipc';
import { AgentBootStatus, AgentBootMessage, AgentToolStatus } from './types';
import { getOrchestratorSystemPrompt } from '../mastra/agents/prompts';
import { sources } from '../db/schema';
import getDb from '../db';
import SourceRegistrationManager from '../mastra/workflows/sourceRegistrationManager';
import { getOrchestrator } from '../mastra/agents/orchestrator';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './utils/util';
import { initStore, getStore } from './store';
import { RedmineBaseInfo } from '../mastra/tools/redmine';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// MCPのSSE通信時に、パッケージング後に正常にストリームを作成できない問題の対策
// パッケージング後はstream型のライブラリはweb-streams-polyfillが適用されてしまうため、開発環境と同じくnode:stream/webを使用するように設定
(globalThis as any).ReadableStream = ReadableStream;
(globalThis as any).WritableStream = WritableStream;
(globalThis as any).TransformStream = TransformStream;

// Mastraのインスタンスと状態を保持する変数
let mastraInstance: Mastra | null = null;
// スレッドごとのAbortControllerを管理するMap
const threadAbortControllers = new Map<string, AbortController>();
const mastraStatus: AgentBootStatus = {
  state: 'initializing',
  messages: [],
  tools: {
    document: false,
    redmine: false,
    gitlab: false,
    mcp: false,
    stagehand: false,
  },
};
// Redmineの基本情報を保持する変数
let redmineBaseInfo: RedmineBaseInfo | null = null;

/**
 * Mastraの状態を変更し、レンダラーに通知する
 */
const updateMastraStatus = (
  newState: AgentBootStatus['state'],
  message?: AgentBootMessage,
  tools?: AgentToolStatus,
) => {
  mastraStatus.state = newState;

  if (message) {
    const newMessage: AgentBootMessage = {
      id: crypto.randomUUID(),
      type: message.type,
      content: message.content,
    };
    mastraStatus.messages?.push(newMessage);
  }

  if (tools) {
    mastraStatus.tools = tools;
  }
};

const initMastraStatus = () => {
  mastraStatus.state = 'initializing';
  mastraStatus.messages = [];
};

/**
 * メッセージIDを指定して削除する
 */
const removeMessage = (messageId: string) => {
  mastraStatus.messages = mastraStatus.messages?.filter(
    (msg) => msg.id !== messageId,
  );
};

/**
 * Mastraインスタンスを取得する関数
 * @returns Mastraインスタンス
 */
export const getMastra = (): Mastra => {
  if (!mastraInstance) {
    throw new Error('Mastraインスタンスが初期化されていません');
  }
  return mastraInstance;
};

/**
 * Mastraの初期化を行う関数
 * 環境に応じたログレベルを設定し、オーケストレーターエージェントを登録する
 */
const initializeMastra = async (): Promise<void> => {
  try {
    initMastraStatus();

    // 開発環境か本番環境かによってログレベルを切り替え
    const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    // ロガーの作成
    const logger = createLogger({
      name: 'MyPedia',
      level: logLevel,
    });

    // オーケストレーターエージェントを取得
    const { agent, alertMessages, toolStatus, redmineInfo } =
      await getOrchestrator();

    // Redmineの基本情報を保存
    redmineBaseInfo = redmineInfo;

    // 起動メッセージを更新
    alertMessages.forEach((message) => {
      mastraStatus.messages?.push(message);
    });

    if (!agent) {
      throw new Error('オーケストレーターエージェントの取得に失敗しました');
    }

    // Mastraインスタンスを初期化
    mastraInstance = new Mastra({
      agents: { orchestratorAgent: agent },
      workflows: { sourceRegistrationWorkflow },
      logger,
    });

    console.log('Mastraインスタンスの初期化が完了しました');
    updateMastraStatus('ready', undefined, toolStatus);
  } catch (error) {
    console.error('Mastraの初期化に失敗しました:', error);
  }
};

const setupStoreHandlers = () => {
  ipcMain.handle(
    IpcChannels.GET_STORE_VALUE,
    async (
      _,
      key: string,
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.GET_STORE_VALUE]> => {
      const store = getStore();
      return store.get(key);
    },
  );

  ipcMain.handle(
    IpcChannels.SET_STORE_VALUE,
    async (
      _,
      key: string,
      value: unknown,
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.SET_STORE_VALUE]> => {
      try {
        const store = getStore();
        store.set(key, value);
        return true;
      } catch (error) {
        console.error('設定の保存中にエラーが発生:', error);
        return false;
      }
    },
  );
};

/**
 * Mastraの状態を取得するIPCハンドラ
 */
// Mastraの状態取得ハンドラ
ipcMain.handle(
  IpcChannels.GET_AGENT_STATUS,
  (): IpcResponsePayloadMap[typeof IpcChannels.GET_AGENT_STATUS] =>
    mastraStatus,
);

// メッセージ削除ハンドラ
ipcMain.handle(
  IpcChannels.REMOVE_AGENT_MESSAGE,
  (
    _,
    messageId: string,
  ): IpcResponsePayloadMap[typeof IpcChannels.REMOVE_AGENT_MESSAGE] => {
    let success = false;
    let error: string | undefined;
    try {
      removeMessage(messageId);
      success = true;
    } catch (err) {
      success = false;
      error = (err as Error).message;
    }
    return { success, error };
  },
);

// Mastraの設定更新ハンドラ
ipcMain.handle(
  IpcChannels.REINITIALIZE_AGENT,
  async (): Promise<
    IpcResponsePayloadMap[typeof IpcChannels.REINITIALIZE_AGENT]
  > => {
    try {
      // 設定変更時はエージェントのみ再初期化
      await initializeMastra();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  },
);

// チャット関連のIPCハンドラー
const setupChatHandlers = () => {
  // チャット中断ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_ABORT_REQUEST,
    async (
      _,
      threadId,
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.CHAT_ABORT_REQUEST]
    > => {
      let success = false;
      let error: string | undefined;
      try {
        const controller = threadAbortControllers.get(threadId);
        if (controller) {
          controller.abort();
          threadAbortControllers.delete(threadId);
          console.log(`Thread ${threadId} の生成を中断しました`);
          success = true;
        }
      } catch (err) {
        console.error('スレッドの中断中にエラーが発生:', err);
        success = false;
        error = (err as Error).message;
      }
      return { success, error };
    },
  );

  // チャットメッセージ編集履歴ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_EDIT_HISTORY,
    async (
      _,
      {
        threadId,
        oldContent,
        oldCreatedAt,
      }: IpcRequestPayloadMap[typeof IpcChannels.CHAT_EDIT_HISTORY],
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_EDIT_HISTORY]> => {
      try {
        const mastra = getMastra();
        const orchestratorAgent = mastra.getAgent('orchestratorAgent');
        const memory = orchestratorAgent.getMemory();

        if (!memory) {
          throw new Error('メモリインスタンスが初期化されていません');
        }

        // メッセージ履歴を取得
        const messages = await memory.storage.getMessages({
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
        await memory.storage.deleteThread({ threadId });

        // スレッドを再作成
        // await memory.createThread({
        //   resourceId: 'user',
        //   title: '',
        //   threadId,
        // });

        // 取得した履歴をメモリに保存
        await memory.saveMessages({
          messages: history,
          memoryConfig: undefined,
        });

        return { success: true };
      } catch (error) {
        console.error('メッセージ履歴削除中にエラーが発生:', error);
        return { success: false, error: (error as Error).message };
      }
    },
  );

  // メッセージ送信ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_SEND_MESSAGE,
    async (
      event,
      {
        roomId,
        messages,
      }: IpcRequestPayloadMap[typeof IpcChannels.CHAT_SEND_MESSAGE],
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_SEND_MESSAGE]> => {
      try {
        // 新しいAbortControllerを作成
        const controller = new AbortController();
        threadAbortControllers.set(roomId, controller);

        // Mastraインスタンスからオーケストレーターエージェントを取得
        const mastra = getMastra();
        const orchestratorAgent = mastra.getAgent('orchestratorAgent');

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
          async execute(writer) {
            // ストリーミングの開始を通知（このデータは利用されない、あくまで通知するためだけ）
            writer.writeMessageAnnotation({
              type: 'status',
              value: 'processing',
            });
            // streaming falseの場合のメッセージ送信処理
            const res = await orchestratorAgent.generate(
              convertToCoreMessages(messages),
              {
                resourceId: 'user', // 固定のリソースID
                instructions: await getOrchestratorSystemPrompt(
                  mastraStatus.tools ?? {
                    document: false,
                    redmine: false,
                    gitlab: false,
                    mcp: false,
                    stagehand: false,
                  },
                  redmineBaseInfo,
                ),
                threadId: roomId, // チャットルームIDをスレッドIDとして使用
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
              },
            );
            writer.write(
              `d:${JSON.stringify({ finishReason: res.finishReason, ...res.usage })}\n`,
            );
            event.sender.send(IpcChannels.CHAT_COMPLETE);
            // 処理が完了したらAbortControllerを削除
            threadAbortControllers.delete(roomId);
          },
          onError(error) {
            // エラーが発生したときの処理
            console.error('テキスト生成中にエラーが発生:', error);
            // エラー時もAbortControllerを削除
            threadAbortControllers.delete(roomId);
            let errorDetail: string;
            if (APICallError.isInstance(error)) {
              // APIコールエラーの場合はresponseBodyの内容を取得
              errorDetail = error.message;
              if (error.responseBody) {
                errorDetail += `:\n${error.responseBody}`;
              }
            } else if (error instanceof Error) {
              errorDetail = error.message;
            } else {
              errorDetail = JSON.stringify(error);
            }
            return `テキスト生成中にエラーが発生しました:\n${errorDetail}`;
          },
        });

        // テキストストリームを処理
        // @ts-ignore
        for await (const chunk of dataStream) {
          // チャンクをフロントエンドに送信
          event.sender.send(IpcChannels.CHAT_STREAM, chunk);
        }

        return { success: true };
      } catch (error) {
        console.error('メッセージ送信中にエラーが発生:', error);
        // エラー時もAbortControllerを削除
        threadAbortControllers.delete(roomId);
        event.sender.send(IpcChannels.CHAT_ERROR, {
          message: `${(error as Error).message}`,
        });
        return { success: false, error: (error as Error).message };
      }
    },
  );

  // チャットルーム一覧取得ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_GET_ROOMS,
    async (): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.CHAT_GET_ROOMS]
    > => {
      try {
        const mastra = getMastra();
        // マスターエージェントからメモリを取得（オーケストレーターエージェントを使用）
        const orchestratorAgent = mastra.getAgent('orchestratorAgent');

        // メモリのスレッド一覧を取得
        const threads = await orchestratorAgent
          .getMemory()
          ?.getThreadsByResourceId({
            resourceId: 'user',
          });

        if (!threads) {
          return [];
        }

        // スレッドをチャットルーム形式に変換
        return threads;
      } catch (error) {
        console.error('チャットルーム一覧の取得中にエラーが発生:', error);
        return [];
      }
    },
  );

  // チャットメッセージ履歴取得ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_GET_MESSAGES,
    async (
      _,
      threadId: string,
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_GET_MESSAGES]> => {
      try {
        const mastra = getMastra();
        const orchestratorAgent = mastra.getAgent('orchestratorAgent');
        // 画像オブジェクトのMIMEタイプを同期検出するためのライブラリ
        const { default: imageType } = await import('image-type');

        // スレッド内のメッセージを取得
        const result = await orchestratorAgent.getMemory()?.query({ threadId });

        if (!result) {
          return [];
        }

        const { uiMessages, messages } = result;
        // messages内の要素でroleが'user'の場合に、contentのtypeが'image'のものがあれば、画像データを対応するuiMessagesにも付与する
        for (const message of messages) {
          if (message.role !== 'user' || typeof message.content === 'string') {
            // eslint-disable-next-line no-continue
            continue;
          }

          // 3) 画像パートのみ抽出
          const imageParts = message.content.filter(
            (part) => part.type === 'image',
          );
          if (imageParts.length === 0) {
            // eslint-disable-next-line no-continue
            continue;
          }

          // 4) 画像パートごとにBase64へ変換
          const attachments = await Promise.all(
            imageParts.map(async (part) => {
              // a) Buffer に変換
              const buffer = Buffer.from(Object.values(part.image));
              // b) MIMEタイプを同期検出
              const type = await imageType(buffer);
              const mime = type ? type.mime : 'application/octet-stream';
              // c) Data URL を組み立て
              const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
              return { url: dataUrl };
            }),
          );

          // 5) 対応する UI メッセージを特定して attachments をセット
          // @ts-ignore CoreMessageもダンプしてみるとidが存在する
          const uiMsg = uiMessages.find((u) => u.id === message.id);
          if (uiMsg) {
            uiMsg.experimental_attachments = attachments;
          } else {
            // @ts-ignore CoreMessageもダンプしてみるとidが存在する
            console.warn(`対応するUIメッセージが見つかりません: ${message.id}`);
          }
        }

        // メッセージをチャットメッセージ形式に変換
        return uiMessages;
      } catch (error) {
        console.error('チャットメッセージの取得中にエラーが発生:', error);
        return [];
      }
    },
  );

  // チャットルーム削除ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_DELETE_ROOM,
    async (
      _,
      threadId: string,
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_DELETE_ROOM]> => {
      try {
        const mastra = getMastra();
        const orchestratorAgent = mastra.getAgent('orchestratorAgent');

        // スレッドを削除
        await orchestratorAgent.getMemory()?.deleteThread(threadId);

        return { success: true };
      } catch (error) {
        console.error('チャットルームの削除中にエラーが発生:', error);
        return { success: false, error: (error as Error).message };
      }
    },
  );

  // スレッド作成ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_CREATE_THREAD,
    async (
      _,
      { roomId, title },
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.CHAT_CREATE_THREAD]
    > => {
      try {
        const mastra = getMastra();
        const orchestratorAgent = mastra.getAgent('orchestratorAgent');
        const memory = orchestratorAgent.getMemory();

        if (!memory) {
          throw new Error('メモリインスタンスが初期化されていません');
        }
        await memory.createThread({
          resourceId: 'user',
          title,
          threadId: roomId,
        });

        return { success: true };
      } catch (error) {
        console.error('チャットルームの作成中にエラーが発生:', error);
        return { success: false, error: (error as Error).message };
      }
    },
  );
};

// ソース関連のIPCハンドラー
// ファイルシステム関連のIPCハンドラー
const setupFsHandlers = () => {
  ipcMain.handle(
    IpcChannels.FS_CHECK_PATH_EXISTS,
    async (_, filePath: string): Promise<boolean> => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  );
};

const setupSourceHandlers = () => {
  // ソース再読み込みハンドラ
  ipcMain.handle(
    IpcChannels.SOURCE_RELOAD,
    async (): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.SOURCE_RELOAD]
    > => {
      try {
        const registrationManager = SourceRegistrationManager.getInstance();
        await registrationManager.registerAllFiles();
        return { success: true, message: 'ソースの再読み込みが完了しました' };
      } catch (error) {
        console.error('ソースの再読み込み中にエラーが発生:', error);
        return {
          success: false,
          message: `エラーが発生しました: ${(error as Error).message}`,
        };
      }
    },
  );

  // ソース一覧取得ハンドラ
  ipcMain.handle(
    IpcChannels.SOURCE_GET_ALL,
    async (): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.SOURCE_GET_ALL]
    > => {
      try {
        const db = await getDb();
        const sourcesList = await db.select().from(sources);
        return {
          success: true,
          sources: sourcesList.map((source: Source) => ({
            ...source,
            // ISO 8601形式の日時文字列をDateオブジェクトに変換してから文字列に戻す
            // これにより、フロントエンドで一貫した日時表示が可能になる
            createdAt: new Date(source.createdAt).toISOString(),
            updatedAt: new Date(source.updatedAt).toISOString(),
          })),
        };
      } catch (error) {
        console.error('ソース一覧の取得中にエラーが発生:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  );

  // ソースの有効/無効状態を更新するハンドラ
  ipcMain.handle(
    IpcChannels.SOURCE_UPDATE_ENABLED,
    async (
      _,
      { sourceId, isEnabled },
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.SOURCE_UPDATE_ENABLED]
    > => {
      try {
        const db = await getDb();
        await db
          .update(sources)
          .set({ isEnabled })
          .where(eq(sources.id, sourceId));
        return { success: true };
      } catch (error) {
        console.error('ソースの有効/無効状態の更新中にエラーが発生:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  );
};

// ソース登録処理の実行
const initializeSourceRegistration = async () => {
  console.log('ソースファイルの初期登録を開始します...');
  const registrationManager = SourceRegistrationManager.getInstance();

  // 処理中のソースを削除
  await registrationManager.clearProcessingSources();
  console.log('処理中のソースを削除しました');

  // ソース登録を実行
  await registrationManager.registerAllFiles();
  console.log('ソースファイルの初期登録が完了しました');
};

let mainWindow: BrowserWindow | null = null;

// ipcMain.on('ipc-example', async (event, arg) => {
//   const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
//   console.log(msgTemplate(arg));
//   event.reply('ipc-example', msgTemplate('pong'));
// });

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  // new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

crashReporter.start({
  // ミニダンプをアップロードしない設定
  submitURL: '',
  uploadToServer: false,
  compress: true,
});

const initialize = async () => {
  createWindow();
  await initStore();
  await initializeMastra(); // Mastraの初期化を追加
  setupStoreHandlers();
  setupChatHandlers();
  setupFsHandlers();
  setupSourceHandlers();
  initializeSourceRegistration();
};

app.whenReady().then(initialize).catch(console.error);

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
