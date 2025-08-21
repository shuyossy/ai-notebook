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
import { createDataStream, APICallError } from 'ai';
import { eq } from 'drizzle-orm';
import {
  ReadableStream,
  WritableStream,
  TransformStream,
} from 'node:stream/web';
import { MastraError } from '@mastra/core/error';
import { getStore } from './store';
import type { Source } from '../db/schema';
import {
  IpcChannels,
  IpcResponsePayloadMap,
  IpcRequestPayloadMap,
} from './types/ipc';
import { sources } from '../db/schema';
import getDb from '../db';
import SourceRegistrationManager from '../mastra/workflows/sourceRegistration/sourceRegistrationManager';
import SourceReviewManager from '../mastra/workflows/sourceReview/sourceReviewManager';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './utils/util';
import { ReviewService } from './service/reviewService';
import { SettingsService } from './service/settingsService';
import { ChatService } from './service/chatService';
import { mastra } from '../mastra';
import { judgeFinishReason } from '../mastra/agents/lib';

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

// ユーザは利用者のみなのでIDは固定
const userId = 'user';

const settingsService = new SettingsService();

const MastraMemory = mastra.getAgent('orchestrator').getMemory();
if (!MastraMemory) {
  throw new Error('メモリが初期化されていません');
}
const chatService = new ChatService(MastraMemory);

const reviewService = new ReviewService();

/**
 * 設定の初期化を行う関数
 */
const initializeSettings = async (): Promise<void> => {
  try {
    // 設定の初期化
    await settingsService.initializeSettings();
    console.log('設定の初期化が完了しました');
  } catch (error) {
    console.error('設定の初期化に失敗しました:', error);
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
 * 設定状態を取得するIPCハンドラ
 */
// 設定状態取得ハンドラ
ipcMain.handle(
  IpcChannels.GET_SETTINGS_STATUS,
  (): IpcResponsePayloadMap[typeof IpcChannels.GET_SETTINGS_STATUS] =>
    settingsService.getStatus(),
);

// メッセージ削除ハンドラ
ipcMain.handle(
  IpcChannels.REMOVE_SETTINGS_MESSAGE,
  (
    _,
    messageId: string,
  ): IpcResponsePayloadMap[typeof IpcChannels.REMOVE_SETTINGS_MESSAGE] => {
    let success = false;
    let error: string | undefined;
    try {
      settingsService.removeMessage(messageId);
      success = true;
    } catch (err) {
      success = false;
      error = (err as Error).message;
    }
    return { success, error };
  },
);

// 設定更新ハンドラ
ipcMain.handle(
  IpcChannels.REINITIALIZE_SETTINGS,
  async (): Promise<
    IpcResponsePayloadMap[typeof IpcChannels.REINITIALIZE_SETTINGS]
  > => {
    try {
      // 設定変更時はツールを初期化
      await settingsService.initializeSettings();
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
        const controller = chatService.getOrCreateAbortController(threadId);
        controller.abort();
        chatService.deleteAbortController(threadId);
        console.log(`Thread ${threadId} の生成を中断しました`);
        success = true;
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
    IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID,
    async (
      _,
      {
        threadId,
        messageId,
      }: IpcRequestPayloadMap[typeof IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID]
    > => {
      try {
        const memory = mastra.getAgent('orchestrator').getMemory();
        if (!memory) {
          throw new Error('メモリインスタンスが初期化されていません');
        }
        chatService.deleteMessagesBeforeSpecificId(threadId, messageId);
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
        const controller = chatService.getOrCreateAbortController(roomId);

        const orchestratorAgent = mastra.getAgent('orchestrator');

        // runtimeContextを作成
        const runtimeContext = await settingsService.getRuntimeContext();

        // 利用ツールの取得
        const toolsets = await settingsService.getToolsets();

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
            const res = await orchestratorAgent.generate(messages, {
              runtimeContext,
              toolsets,
              resourceId: 'user', // 固定のリソースID
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
            });
            const { success, reason } = judgeFinishReason(res.finishReason);
            if (!success) {
              // 正常終了でない場合はエラーを投げる
              throw new Error(reason);
            }
            writer.write(
              `d:${JSON.stringify({ finishReason: res.finishReason, ...res.usage })}\n`,
            );
            event.sender.send(IpcChannels.CHAT_COMPLETE);
            // 処理が完了したらAbortControllerを削除
            chatService.deleteAbortController(roomId);
          },
          onError(error) {
            // エラーが発生したときの処理
            console.error('テキスト生成中にエラーが発生:', error);
            // エラー時もAbortControllerを削除
            chatService.deleteAbortController(roomId);
            let errorDetail: string;
            if (
              error instanceof MastraError &&
              APICallError.isInstance(error.cause)
            ) {
              // APIコールエラーの場合はresponseBodyの内容を取得
              errorDetail = error.cause.message;
              if (error.cause.responseBody) {
                errorDetail += `:\n${error.cause.responseBody}`;
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
        chatService.deleteAbortController(roomId);
        event.sender.send(IpcChannels.CHAT_ERROR, {
          message: `${(error as Error).message}`,
        });
        event.sender.send(IpcChannels.CHAT_COMPLETE);
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
        const threads = await chatService.getThreadList(userId);
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
        return chatService.getThreadMessages(threadId);
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
        await chatService.deleteThread(threadId);

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
        await chatService.createThread(roomId, title, userId);

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

const setupReviewHandlers = () => {
  // レビュー履歴の取得ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_GET_HISTORIES,
    async (): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_GET_HISTORIES]
    > => {
      try {
        const histories = await reviewService.getReviewHistories();

        return {
          success: true,
          histories,
        };
      } catch (error) {
        console.error('レビュー履歴の取得中にエラーが発生:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  );

  // チェックリストの取得ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_GET_HISTORY_DETAIL,
    async (
      _,
      historyId: string,
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_GET_HISTORY_DETAIL]
    > => {
      try {
        const checklistResults =
          await reviewService.getReviewHistoryDetail(historyId);

        return {
          success: true,
          checklistResults,
        };
      } catch (error) {
        console.error('チェックリストの取得中にエラーが発生:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  );

  // レビュー履歴の削除ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_DELETE_HISTORY,
    async (
      _,
      historyId: string,
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_DELETE_HISTORY]
    > => {
      try {
        await reviewService.deleteReviewHistory(historyId);

        return { success: true };
      } catch (error) {
        console.error('レビュー履歴の削除中にエラーが発生:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  );

  // チェックリスト抽出ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL,
    async (
      event,
      {
        reviewHistoryId,
        sourceIds,
      }: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]
    > => {
      try {
        const manager = SourceReviewManager.getInstance();

        // 非同期でチェックリスト抽出処理を実行
        const result = manager.extractChecklistWithNotification(
          reviewHistoryId,
          sourceIds,
          event,
        );

        return result;
      } catch (error) {
        console.error('チェックリスト抽出処理開始時にエラーが発生:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  );

  // チェックリストの更新ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_UPDATE_CHECKLIST,
    async (
      _,
      {
        reviewHistoryId,
        checklistEdits,
      }: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_UPDATE_CHECKLIST],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_UPDATE_CHECKLIST]
    > => {
      try {
        const result = await reviewService.updateChecklists(
          reviewHistoryId,
          checklistEdits,
        );

        return result;
      } catch (error) {
        console.error('チェックリストの更新中にエラーが発生:', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
  );

  // レビュー実施ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_EXECUTE_CALL,
    async (
      event,
      {
        reviewHistoryId,
        sourceIds,
      }: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL]
    > => {
      try {
        const manager = SourceReviewManager.getInstance();

        // 非同期でレビュー実行処理を実行
        manager.executeReviewWithNotification(
          reviewHistoryId,
          sourceIds,
          event,
        );

        return { success: true };
      } catch (error) {
        console.error('レビュー実行処理開始中にエラーが発生:', error);
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
  await initializeSettings();
  setupStoreHandlers();
  setupChatHandlers();
  setupFsHandlers();
  setupSourceHandlers();
  setupReviewHandlers();
  initializeSourceRegistration();
};

app.whenReady().then(initialize).catch(console.error);

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
