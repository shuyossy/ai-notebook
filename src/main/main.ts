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
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import { maskStreamTags } from '@mastra/core/utils';
import { type Source } from '../db/schema';
import { sources } from '../db/schema';
import getDb, { initializeDb } from '../db';
import SourceRegistrationManager from '../mastra/workflows/sourceRegistrationManager';
import { getOrchestrator } from '../mastra/agents/orchestrator';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './utils/util';
import { initStore, getStore } from './store';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// Mastraのインスタンスを保持する変数
let mastraInstance: Mastra | null = null;

/**
 * Mastraインスタンスを取得する関数
 * @returns Mastraインスタンス
 */
const getMastra = (): Mastra => {
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
    // 開発環境か本番環境かによってログレベルを切り替え
    const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    // ロガーの作成
    const logger = createLogger({
      name: 'MyPedia',
      level: logLevel,
    });

    // オーケストレーターエージェントを取得
    const orchestratorAgent = getOrchestrator();

    // Mastraインスタンスを初期化
    mastraInstance = new Mastra({
      agents: { orchestratorAgent },
      logger,
    });

    console.log('Mastraインスタンスの初期化が完了しました');
  } catch (error) {
    console.error('Mastraの初期化に失敗しました:', error);
    throw error;
  }
};

// ストアのIPC通信ハンドラーを設定
const setupStoreHandlers = () => {
  ipcMain.handle('get-store-value', async (_, key: string) => {
    const store = getStore();
    return store.get(key);
  });

  ipcMain.handle('set-store-value', async (_, key: string, value: unknown) => {
    const store = getStore();
    store.set(key, value);
    return true;
  });
};

// チャット関連のIPCハンドラー
const setupChatHandlers = () => {
  // メッセージ送信ハンドラ
  ipcMain.handle('chat-send-message', async (event, { roomId, message }) => {
    try {
      // Mastraインスタンスからオーケストレーターエージェントを取得
      const mastra = getMastra();
      const orchestratorAgent = mastra.getAgent('orchestratorAgent');

      // メッセージをストリーミングで送信
      const stream = await orchestratorAgent.stream(message, {
        resourceId: 'user', // 固定のリソースID
        threadId: roomId, // チャットルームIDをスレッドIDとして使用
        maxSteps: 30, // ツールの利用上限
        onFinish: ({ text, finishReason }) => {
          // ストリーミングが完了したときの処理
          // フロントエンドに完了通知を送信
          event.sender.send('chat-complete', {
            text,
            finishReason,
          });
        },
        onStepFinish: ({
          text,
          toolCalls,
        }: {
          text: string;
          toolCalls: any[];
        }) => {
          // ステップ完了ごとにフロントエンドに進捗を通知
          // ツール呼び出し情報も含めて送信
          event.sender.send('chat-step', { text, toolCalls });
        },
      });

      // テキストストリームを処理
      try {
        // ライフサイクルフックを追加してUIフィードバックを提供する
        const maskedStream = maskStreamTags(
          stream.textStream,
          'working_memory',
          {
            // working_memoryタグが開始されたときに呼び出される
            onStart: () => console.debug('作業メモリ更新中...'),
            // working_memoryタグが終了したときに呼び出される
            onEnd: () => console.debug('作業メモリの更新が完了しました'),
            // マスクされたコンテンツと共に呼び出される
            onMask: (chunk) => console.debug('更新された作業メモリ:', chunk),
          },
        );
        for await (const chunk of maskedStream) {
          // チャンクをフロントエンドに送信
          event.sender.send('chat-stream', chunk);
        }
      } catch (streamError) {
        console.error('ストリーミング処理中にエラーが発生:', streamError);
      }

      return { success: true };
    } catch (error) {
      console.error('AIエージェントとの通信中にエラーが発生:', error);
      event.sender.send('chat-error', {
        message: `エラーが発生しました: ${(error as Error).message}`,
      });
      return { success: false, error: (error as Error).message };
    }
  });

  // チャットルーム一覧取得ハンドラ
  ipcMain.handle('chat-get-rooms', async () => {
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
      return threads.map((thread) => ({
        id: thread.id,
        title: thread.title || '新しいチャット',
        createdAt: new Date(thread.createdAt).toISOString(),
        updatedAt: new Date(thread.updatedAt).toISOString(),
      }));
    } catch (error) {
      console.error('チャットルーム一覧の取得中にエラーが発生:', error);
      return [];
    }
  });

  // チャットメッセージ履歴取得ハンドラ
  ipcMain.handle('chat-get-messages', async (_, threadId: string) => {
    try {
      const mastra = getMastra();
      const orchestratorAgent = mastra.getAgent('orchestratorAgent');

      // スレッド内のメッセージを取得
      const result = await orchestratorAgent.getMemory()?.query({ threadId });

      if (!result) {
        return [];
      }

      const { uiMessages } = result;

      // メッセージをチャットメッセージ形式に変換
      return uiMessages;
    } catch (error) {
      console.error('チャットメッセージの取得中にエラーが発生:', error);
      return [];
    }
  });

  // チャットルーム削除ハンドラ
  ipcMain.handle('chat-delete-room', async (_, threadId: string) => {
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
  });
};

// ソース関連のIPCハンドラー
const setupSourceHandlers = () => {
  // ソース再読み込みハンドラ
  ipcMain.handle('source-reload', async () => {
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
  });

  // ソース一覧取得ハンドラ
  ipcMain.handle('source-get-all', async () => {
    try {
      const db = await getDb();
      const sourcesList = await db.select().from(sources);
      return sourcesList.map((source: Source) => ({
        ...source,
        // ISO 8601形式の日時文字列をDateオブジェクトに変換してから文字列に戻す
        // これにより、フロントエンドで一貫した日時表示が可能になる
        createdAt: new Date(source.createdAt).toISOString(),
        updatedAt: new Date(source.updatedAt).toISOString(),
      }));
    } catch (error) {
      console.error('ソース一覧の取得中にエラーが発生:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });
};

// ソース登録処理の実行
const initializeSourceRegistration = async () => {
  console.log('ソースファイルの初期登録を開始します...');
  const registrationManager = SourceRegistrationManager.getInstance();

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
  new AppUpdater();
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

const initialize = async () => {
  createWindow();
  await initStore();
  await initializeDb();
  await initializeMastra(); // Mastraの初期化を追加
  setupStoreHandlers();
  setupChatHandlers();
  setupSourceHandlers();
  await initializeSourceRegistration();
};

app.whenReady().then(initialize).catch(console.error);

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
