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
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  crashReporter,
  dialog,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import {
  ReadableStream,
  WritableStream,
  TransformStream,
} from 'node:stream/web';
// @ts-ignore
import { MastraError } from '@mastra/core/error';
import { APICallError } from 'ai';
import { getStore } from './store';
import type { Source } from '@/db/schema';
import {
  IpcChannels,
  IpcResponsePayloadMap,
  IpcRequestPayloadMap,
} from '@/types/ipc';
import { sources } from '../db/schema';
import getDb from '../db';
import SourceRegistrationManager from '../mastra/workflows/sourceRegistration/sourceRegistrationManager';
import SourceReviewManager from '../mastra/workflows/sourceReview/sourceReviewManager';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './lib/util';
import { ReviewService } from './service/reviewService';
import { SettingsService } from './service/settingsService';
import { ChatService } from './service/chatService';
import { getReviewRepository } from './repository/reviewRepository';
import { mastra } from '../mastra';
import { getMainLogger } from './lib/logger';
import { AppError, internalError, normalizeUnknownError } from './lib/error';
import { formatMessage } from './lib/messages';
import { SourceService } from './service/sourceService';

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

const settingsService = SettingsService.getInstance();

const chatService = ChatService.getInstance();

const reviewService = ReviewService.getInstance();

const sourceService = SourceService.getInstance();

const logger = getMainLogger();

/**
 * 設定の初期化を行う関数
 */
const initializeSettings = async (): Promise<void> => {
  try {
    // 設定の初期化
    await settingsService.initializeSettings();
  } catch (err) {
    logger.error(err, '設定の初期化に失敗しました');
    const error = normalizeUnknownError(err);
    throw error;
  }
};

const setupStoreHandlers = () => {
  ipcMain.handle(
    IpcChannels.GET_STORE_VALUE,
    async (
      _,
      key: IpcRequestPayloadMap[typeof IpcChannels.GET_STORE_VALUE],
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.GET_STORE_VALUE]> => {
      const store = getStore();
      return store.get(key);
    },
  );

  ipcMain.handle(
    IpcChannels.SET_STORE_VALUE,
    async (
      _,
      { key, value }: IpcRequestPayloadMap[typeof IpcChannels.SET_STORE_VALUE],
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.SET_STORE_VALUE]> => {
      const store = getStore();
      store.set(key, value);
      return { success: true };
    },
  );
};

/**
 * 設定状態を取得するIPCハンドラ
 */
// 設定状態取得ハンドラ
ipcMain.handle(
  IpcChannels.GET_SETTINGS_STATUS,
  (): IpcResponsePayloadMap[typeof IpcChannels.GET_SETTINGS_STATUS] => {
    return { success: true, data: settingsService.getStatus() };
  },
);

// メッセージ削除ハンドラ
ipcMain.handle(
  IpcChannels.REMOVE_SETTINGS_MESSAGE,
  (
    _,
    messageId: IpcRequestPayloadMap[typeof IpcChannels.REMOVE_SETTINGS_MESSAGE],
  ): IpcResponsePayloadMap[typeof IpcChannels.REMOVE_SETTINGS_MESSAGE] => {
    settingsService.removeMessage(messageId);
    return { success: true };
  },
);

// 設定更新ハンドラ
ipcMain.handle(
  IpcChannels.REINITIALIZE_SETTINGS,
  async (): Promise<
    IpcResponsePayloadMap[typeof IpcChannels.REINITIALIZE_SETTINGS]
  > => {
    await settingsService.initializeSettings();
    return { success: true };
  },
);

// チャット関連のIPCハンドラー
const setupChatHandlers = () => {
  // チャット中断ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_ABORT_REQUEST,
    async (
      _,
      { threadId }: IpcRequestPayloadMap[typeof IpcChannels.CHAT_ABORT_REQUEST],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.CHAT_ABORT_REQUEST]
    > => {
      chatService.abortGeneration(userId, threadId);
      return { success: true };
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
      chatService.deleteMessagesBeforeSpecificId(threadId, messageId);
      return { success: true };
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
        await chatService.generate(userId, roomId, messages, event);

        // テキストストリームを処理
        // @ts-ignore
        for await (const chunk of dataStream) {
          // チャンクをフロントエンドに送信
          event.sender.send(IpcChannels.CHAT_STREAM, chunk);
        }

        return { success: true };
      } catch (error) {
        let errorDetail = '不明なエラー';
        // エラー時もAbortControllerを削除
        chatService.deleteAbortController(userId, roomId);
        if (
          error instanceof MastraError &&
          APICallError.isInstance(error.cause)
        ) {
          errorDetail = error.cause.message;
        } else if (error instanceof AppError) {
          event.sender.send(IpcChannels.CHAT_ERROR, {
            message: error.message,
          });
          event.sender.send(IpcChannels.CHAT_COMPLETE);
          throw error;
        }
        const errorMessage = formatMessage('CHAT_GENERATE_ERROR', {
          detail: errorDetail,
        });
        event.sender.send(IpcChannels.CHAT_ERROR, {
          message: errorMessage,
        });
        event.sender.send(IpcChannels.CHAT_COMPLETE);

        throw internalError({
          expose: true,
          messageCode: 'CHAT_GENERATE_ERROR',
          messageParams: { detail: errorDetail },
          cause: error,
        });
      }
    },
  );

  // チャットルーム一覧取得ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_GET_ROOMS,
    async (): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.CHAT_GET_ROOMS]
    > => {
      const threads = await chatService.getThreadList(userId);
      return { success: true, data: threads };
    },
  );

  // チャットメッセージ履歴取得ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_GET_MESSAGES,
    async (
      _,
      threadId: IpcRequestPayloadMap[typeof IpcChannels.CHAT_GET_MESSAGES],
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_GET_MESSAGES]> => {
      const messages = await chatService.getThreadMessages(threadId);
      return { success: true, data: messages };
    },
  );

  // チャットルーム削除ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_DELETE_ROOM,
    async (
      _,
      threadId: IpcRequestPayloadMap[typeof IpcChannels.CHAT_DELETE_ROOM],
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_DELETE_ROOM]> => {
      await chatService.deleteThread(userId, threadId);
      return { success: true };
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
      await chatService.createThread(roomId, title, userId);
      return { success: true };
    },
  );
};

// ソース関連のIPCハンドラー
// ファイルシステム関連のIPCハンドラー
const setupFsHandlers = () => {
  ipcMain.handle(
    IpcChannels.FS_CHECK_PATH_EXISTS,
    async (
      _,
      filePath: IpcRequestPayloadMap[typeof IpcChannels.FS_CHECK_PATH_EXISTS],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.FS_CHECK_PATH_EXISTS]
    > => {
      try {
        await fs.access(filePath);
        return { success: true, data: true };
      } catch {
        return { success: true, data: false };
      }
    },
  );

  ipcMain.handle(
    IpcChannels.FS_SHOW_OPEN_DIALOG,
    async (
      _,
      options: IpcRequestPayloadMap[typeof IpcChannels.FS_SHOW_OPEN_DIALOG],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.FS_SHOW_OPEN_DIALOG]
    > => {
      const result = await dialog.showOpenDialog(options);
      return { success: true, data: result };
    },
  );
  ipcMain.handle(
    IpcChannels.FS_READ_FILE,
    async (
      _,
      filePath: IpcRequestPayloadMap[typeof IpcChannels.FS_READ_FILE],
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.FS_READ_FILE]> => {
      const data = await fs.readFile(filePath);
      const result = new Uint8Array(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
      return { success: true, data: result };
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
      const registrationManager = SourceRegistrationManager.getInstance();
      await registrationManager.registerAllFiles();
      return {
        success: true,
        data: { message: 'ドキュメントの再読み込みが完了しました' },
      };
    },
  );

  // ソース一覧取得ハンドラ
  ipcMain.handle(
    IpcChannels.SOURCE_GET_ALL,
    async (): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.SOURCE_GET_ALL]
    > => {
      const allSources = await sourceService.getAllSources();
      const data = allSources.map((source: Source) => ({
        ...source,
        // ISO 8601形式の日時文字列をDateオブジェクトに変換してから文字列に戻す
        // これにより、フロントエンドで一貫した日時表示が可能になる
        createdAt: new Date(source.createdAt).toISOString(),
        updatedAt: new Date(source.updatedAt).toISOString(),
      }));
      return { success: true, data };
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
      await sourceService.updateSourceEnabled(sourceId, isEnabled);
      return { success: true };
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
      const histories = await reviewService.getReviewHistories();
      return { success: true, data: histories };
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
      const detail = await reviewService.getReviewHistoryDetail(historyId);
      return { success: true, data: detail };
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
      await reviewService.deleteReviewHistory(historyId);
      return { success: true };
    },
  );

  // チェックリスト抽出ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL,
    async (
      event,
      {
        reviewHistoryId,
        files,
        documentType,
        checklistRequirements,
      }: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]
    > => {
      const manager = SourceReviewManager.getInstance();
      const result = manager.extractChecklistWithNotification(
        reviewHistoryId,
        files,
        event,
        documentType,
        checklistRequirements,
      );
      if (!result.success) {
        return {
          success: false,
          error: { message: result.error!, code: 'INTERNAL' },
        };
      }
      return { success: true };
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
      await reviewService.updateChecklists(reviewHistoryId, checklistEdits);
      return { success: true };
    },
  );

  // レビュー実施ハンドラ
  ipcMain.handle(
    IpcChannels.REVIEW_EXECUTE_CALL,
    async (
      event,
      {
        reviewHistoryId,
        files,
        additionalInstructions,
        commentFormat,
      }: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL],
    ): Promise<
      IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL]
    > => {
      reviewService.updateReviewHistoryAdditionalInstructionsAndCommentFormat(
        reviewHistoryId,
        additionalInstructions,
        commentFormat,
      );
      const manager = SourceReviewManager.getInstance();

      // 非同期でレビュー実行処理を実行
      const result = manager.executeReviewWithNotification(
        reviewHistoryId,
        files,
        event,
        additionalInstructions,
        commentFormat,
      );

      if (!result.success) {
        return {
          success: false,
          error: { message: result.error!, code: 'INTERNAL' },
        };
      }

      return { success: true };
    },
  );
};

// ソース登録処理の実行
const initializeSourceRegistration = async () => {
  logger.debug('ドキュメントの初期登録を開始します');
  const registrationManager = SourceRegistrationManager.getInstance();

  // 処理中のソースを削除
  logger.debug('処理中及び失敗しているドキュメントの実行履歴をクリアしています');
  await registrationManager.clearProcessingSources();

  // ソース登録を実行
  logger.debug('ドキュメントの登録を実行しています');
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
