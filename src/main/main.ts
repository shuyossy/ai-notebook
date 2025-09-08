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
  IpcMainInvokeEvent,
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
  IpcResult,
  RequestChannel,
  IpcChannel,
  IpcNameMap,
} from '@/types/ipc';
import SourceRegistrationManager from '../mastra/workflows/sourceRegistration/sourceRegistrationManager';
import SourceReviewManager from '../mastra/workflows/sourceReview/sourceReviewManager';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './lib/util';
import { ReviewService } from './service/reviewService';
import { SettingsService } from './service/settingsService';
import { ChatService } from './service/chatService';
import { getMainLogger } from './lib/logger';
import {
  AppError,
  internalError,
  normalizeUnknownError,
  toPayload,
} from './lib/error';
import { formatMessage } from './lib/messages';
import { SourceService } from './service/sourceService';
import { ZodSchema } from 'zod';
import { normalizeUnkhownIpcError } from './lib/error';

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

// IpcResponsePayloadMap[C] が IpcResult<T> なら T を取り出す
type DataOf<C extends keyof IpcResponsePayloadMap> =
  IpcResponsePayloadMap[C] extends IpcResult<infer T> ? T : never;

type Handler<C extends RequestChannel> = (
  args: IpcRequestPayloadMap[C],
  ctx: {
    event: IpcMainInvokeEvent;
  },
) => Promise<DataOf<C>> | DataOf<C>;

type Options<C extends RequestChannel> = {
  /** 引数バリデーション (任意) */
  schema?: ZodSchema<IpcRequestPayloadMap[C]>;
  /** 成功/失敗ログに付けたい追加メタデータ (任意) */
  meta?: Record<string, unknown>;
  /** 例外をログするか (デフォルト: true) */
  printErrorLog?: boolean;
  /** 成功時もログするか (デフォルト: false) */
  printSuccessLog?: boolean;
};

/**
 * 型安全な ipcMain.handle ラッパ
 * - handler は「成功データ(DataOf<C>)のみ」返す
 * - 例外はここで握って IpcResult に変換
 *  - renderer 側では try/catch は基本不要
 *  - ただし、メッセージにユーザー向けの文言を含めたい場合は適切な例外処理の上、AppError をthrowすること
 * - Zod スキーマがあれば入力で parse
 */
export function handleIpc<C extends RequestChannel>(
  channel: C,
  handler: Handler<C>,
  opts: Options<C> = {},
) {
  const { schema, meta, printErrorLog = true, printSuccessLog = false } = opts;

  ipcMain.handle(
    channel as IpcChannel,
    async (event, raw): Promise<IpcResponsePayloadMap[C]> => {
      try {
        // 引数バリデーション（任意）
        const args = schema
          ? await schema.parseAsync(raw)
          : (raw as IpcRequestPayloadMap[C]);

        const data = await handler(args, { event });

        if (printSuccessLog) {
          logger.info({ channel, ...meta, ok: true }, 'ipc success');
        }

        return { success: true, data } as IpcResponsePayloadMap[C];
      } catch (err) {
        // normalizeUnknownError で既定フォーマットに寄せる
        const normalized = normalizeUnkhownIpcError(err, IpcNameMap[channel]);
        console.error(normalized);
        if (printErrorLog) {
          logger.error(
            JSON.stringify(normalized, null, 2),
            `IPC ${channel} error`,
          );
        }

        return {
          success: false,
          error: toPayload(normalized),
        } as IpcResponsePayloadMap[C];
      }
    },
  );
}

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
const initializeAgentStatus = async (): Promise<void> => {
  try {
    // 設定の初期化
    await settingsService.initializeSettings();
  } catch (err) {
    logger.error(err, '設定の初期化に失敗しました');
    const error = normalizeUnknownError(err);
  }
};

const setupSettingsHandlers = () => {
  handleIpc(IpcChannels.GET_SETTINGS, async () => {
    return await settingsService.getSettings();
  });

  handleIpc(IpcChannels.SET_SETTINGS, async (settings) => {
    await settingsService.saveSettings(settings);
    return true;
  });
};

/**
 * 設定状態を取得するIPCハンドラ
 */
// 設定状態取得ハンドラ
handleIpc(IpcChannels.GET_SETTINGS_STATUS, async () => {
  return settingsService.getStatus();
});

// メッセージ削除ハンドラ
handleIpc(IpcChannels.REMOVE_SETTINGS_MESSAGE, async (messageId) => {
  settingsService.removeMessage(messageId);
  return undefined as never;
});

// 設定更新ハンドラ
handleIpc(IpcChannels.REINITIALIZE_SETTINGS, async () => {
  await settingsService.initializeSettings();
  return undefined as never;
});

// チャット関連のIPCハンドラー
const setupChatHandlers = () => {
  // チャット中断ハンドラ
  handleIpc(IpcChannels.CHAT_ABORT_REQUEST, async ({ threadId }) => {
    chatService.abortGeneration(threadId);
    return undefined as never;
  });

  // チャットメッセージ編集履歴ハンドラ
  handleIpc(
    IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID,
    async ({ threadId, messageId }) => {
      chatService.deleteMessagesBeforeSpecificId(threadId, messageId);
      return undefined as never;
    },
  );

  // メッセージ送信ハンドラ
  handleIpc(
    IpcChannels.CHAT_SEND_MESSAGE,
    async ({ roomId, messages }, { event }) => {
      try {
        const dataStream = await chatService.generate(
          userId,
          roomId,
          messages,
          event,
        );

        // テキストストリームを処理
        // @ts-ignore
        for await (const chunk of dataStream) {
          // チャンクをフロントエンドに送信
          event.sender.send(IpcChannels.CHAT_STREAM, chunk);
        }

        return undefined as never;
      } catch (error) {
        let errorDetail = '不明なエラー';
        // エラー時もAbortControllerを削除
        chatService.deleteAbortController(roomId);
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
  handleIpc(IpcChannels.CHAT_GET_ROOMS, async () => {
    const threads = await chatService.getThreadList(userId);
    return threads;
  });

  // チャットメッセージ履歴取得ハンドラ
  handleIpc(IpcChannels.CHAT_GET_MESSAGES, async (threadId) => {
    const messages = await chatService.getThreadMessages(threadId);
    return messages;
  });

  // チャットルーム削除ハンドラ
  handleIpc(IpcChannels.CHAT_DELETE_ROOM, async (threadId) => {
    await chatService.deleteThread(threadId);
    return undefined as never;
  });

  // スレッド作成ハンドラ
  handleIpc(IpcChannels.CHAT_CREATE_THREAD, async ({ roomId, title }) => {
    await chatService.createThread(roomId, title, userId);
    return undefined as never;
  });
};

// ソース関連のIPCハンドラー
// ファイルシステム関連のIPCハンドラー
const setupFsHandlers = () => {
  handleIpc(IpcChannels.FS_CHECK_PATH_EXISTS, async (filePath) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  handleIpc(IpcChannels.FS_SHOW_OPEN_DIALOG, async (options) => {
    const result = await dialog.showOpenDialog(options);
    return result;
  });

  handleIpc(IpcChannels.FS_READ_FILE, async (filePath) => {
    const data = await fs.readFile(filePath);
    const result = new Uint8Array(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    return result;
  });
};

const setupSourceHandlers = () => {
  // ソース再読み込みハンドラ
  handleIpc(IpcChannels.SOURCE_RELOAD, async () => {
    const registrationManager = SourceRegistrationManager.getInstance();
    await registrationManager.registerAllFiles();
    return { message: 'ドキュメントの再読み込みが完了しました' };
  });

  // ソース一覧取得ハンドラ
  handleIpc(IpcChannels.SOURCE_GET_ALL, async () => {
    const allSources = await sourceService.getAllSources();
    const data = allSources.map((source: Source) => ({
      ...source,
      // ISO 8601形式の日時文字列をDateオブジェクトに変換してから文字列に戻す
      // これにより、フロントエンドで一貫した日時表示が可能になる
      createdAt: new Date(source.createdAt).toISOString(),
      updatedAt: new Date(source.updatedAt).toISOString(),
    }));
    return data;
  });

  // ソースの有効/無効状態を更新するハンドラ
  handleIpc(
    IpcChannels.SOURCE_UPDATE_ENABLED,
    async ({ sourceId, isEnabled }) => {
      await sourceService.updateSourceEnabled(sourceId, isEnabled);
      return undefined as never;
    },
  );
};

const setupReviewHandlers = () => {
  // レビュー履歴の取得ハンドラ
  handleIpc(IpcChannels.REVIEW_GET_HISTORIES, async () => {
    const histories = await reviewService.getReviewHistories();
    return histories;
  });

  // チェックリストの取得ハンドラ
  handleIpc(IpcChannels.REVIEW_GET_HISTORY_DETAIL, async (historyId) => {
    const detail = await reviewService.getReviewHistoryDetail(historyId);
    return detail;
  });

  // レビュー指示の取得ハンドラ
  handleIpc(IpcChannels.REVIEW_GET_HISTORY_INSTRUCTION, async (historyId) => {
    const instruction = await reviewService.getReviewInstruction(historyId);
    return instruction;
  });

  // レビュー履歴の削除ハンドラ
  handleIpc(IpcChannels.REVIEW_DELETE_HISTORY, async (historyId) => {
    await reviewService.deleteReviewHistory(historyId);
    return undefined as never;
  });

  // チェックリスト抽出ハンドラ
  handleIpc(
    IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL,
    async (
      { reviewHistoryId, files, documentType, checklistRequirements },
      { event },
    ) => {
      const manager = SourceReviewManager.getInstance();
      const result = manager.extractChecklistWithNotification(
        reviewHistoryId,
        files,
        event,
        documentType,
        checklistRequirements,
      );
      if (!result.success) {
        throw internalError({
          expose: true,
          messageCode: 'UNKNOWN_ERROR',
          messageParams: { detail: result.error! },
          cause: new Error(result.error!),
        });
      }
      return undefined as never;
    },
  );

  // チェックリストの更新ハンドラ
  handleIpc(
    IpcChannels.REVIEW_UPDATE_CHECKLIST,
    async ({ reviewHistoryId, checklistEdits }) => {
      await reviewService.updateChecklists(reviewHistoryId, checklistEdits);
      return undefined as never;
    },
  );

  // レビュー実施ハンドラ
  handleIpc(
    IpcChannels.REVIEW_EXECUTE_CALL,
    async (
      { reviewHistoryId, files, additionalInstructions, commentFormat },
      { event },
    ) => {
      reviewService.updateReviewInstruction(
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
        throw internalError({
          expose: true,
          messageCode: 'UNKNOWN_ERROR',
          messageParams: { detail: result.error! },
          cause: new Error(result.error!),
        });
      }

      return undefined as never;
    },
  );
};

// ソース登録処理の実行
const initializeSourceRegistration = async () => {
  logger.debug('ドキュメントの初期登録を開始します');
  const registrationManager = SourceRegistrationManager.getInstance();

  // 処理中のソースを削除
  logger.debug(
    '処理中及び失敗しているドキュメントの実行履歴をクリアしています',
  );
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
  await initializeAgentStatus();
  setupSettingsHandlers();
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
