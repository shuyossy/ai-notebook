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
import { type Source } from '../db/schema';
import { sources } from '../db/schema';
import getDb, { initializeDb } from '../db';
import SourceRegistrationManager from '../mastra/workflows/sourceRegistrationManager';
import { getOrchestrator } from '../mastra/agents/orchestrator';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { initStore, getStore } from './store';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

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
      // AIエージェントにメッセージを送信
      const orchInstance = getOrchestrator();
      const stream = await orchInstance.stream(message, {
        resourceId: 'user', // 実際の実装ではユーザーIDを使用
        threadId: roomId, // チャットルームIDをスレッドIDとして使用
        maxSteps: 5, // 最大5ステップまでツールを使用可能
        onStepFinish: ({
          text,
          toolCalls,
        }: {
          text: string;
          toolCalls: any[];
        }) => {
          // ステップ完了ごとにフロントエンドに進捗を通知
          event.sender.send('chat-step', { text, toolCalls });
        },
      });

      // ストリーミング処理は可能な限りシンプルに実装
      try {
        event.sender.send('chat-stream', await stream.text);
      } catch (streamError) {
        console.error('ストリーミング処理中にエラーが発生:', streamError);
      }

      // 完了通知
      event.sender.send('chat-complete', {
        text: await stream.text,
      });

      return { success: true };
    } catch (error) {
      console.error('AIエージェントとの通信中にエラーが発生:', error);
      event.sender.send('chat-error', {
        message: `エラーが発生しました: ${(error as Error).message}`,
      });
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
  console.log('ソースファイルの登録を開始します...');
  const registrationManager = SourceRegistrationManager.getInstance();
  const db = await getDb();

  // 既存のソースをすべて'idle'状態にリセット
  await db.update(sources).set({ status: 'idle', error: null });

  // ソース登録を実行
  await registrationManager.registerAllFiles();
  console.log('ソースファイルの登録が完了しました');
};

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

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
  await initStore();
  setupStoreHandlers();
  setupChatHandlers();
  setupSourceHandlers();
  await initializeDb();
  createWindow();
  await initializeSourceRegistration();
};

app.whenReady().then(initialize).catch(console.error);

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
