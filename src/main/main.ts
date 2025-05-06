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
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import { createDataStream } from 'ai';
import { eq } from 'drizzle-orm';
import { sourceRegistrationWorkflow } from '../mastra/workflows/sourceRegistration';
import { type Source } from '../db/schema';
import { IpcChannels, IpcResponsePayloadMap } from './types/ipc';
import { AgentBootStatus, AgentBootMessage, AgentToolStatus } from './types';
import { getOrchestratorSystemPrompt } from '../mastra/agents/prompts';
import { sources } from '../db/schema';
import getDb from '../db';
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

// Mastraのインスタンスと状態を保持する変数
let mastraInstance: Mastra | null = null;
const mastraStatus: AgentBootStatus = {
  state: 'initializing',
  messages: [],
  tools: {
    redmine: false,
    gitlab: false,
    mcp: false,
  },
};

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
    const { agent, alertMessages, toolStatus } = await getOrchestrator();

    // Mastraインスタンスを初期化
    mastraInstance = new Mastra({
      agents: { orchestratorAgent: agent },
      workflows: { sourceRegistrationWorkflow },
      logger,
    });

    // 起動メッセージを更新
    alertMessages.forEach((message) => {
      mastraStatus.messages?.push(message);
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

// Mastraの再初期化ハンドラ
ipcMain.handle(
  IpcChannels.REINITIALIZE_AGENT,
  async (): Promise<
    IpcResponsePayloadMap[typeof IpcChannels.REINITIALIZE_AGENT]
  > => {
    try {
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
  // メッセージ送信ハンドラ
  ipcMain.handle(
    IpcChannels.CHAT_SEND_MESSAGE,
    async (
      event,
      { roomId, content },
    ): Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_SEND_MESSAGE]> => {
      try {
        // Mastraインスタンスからオーケストレーターエージェントを取得
        const mastra = getMastra();
        const orchestratorAgent = mastra.getAgent('orchestratorAgent');

        // メッセージをストリーミングで送信
        const stream = await orchestratorAgent.stream(content, {
          resourceId: 'user', // 固定のリソースID
          instructions: getOrchestratorSystemPrompt(
            mastraStatus.tools ?? {
              redmine: false,
              gitlab: false,
              mcp: false,
            },
          ),
          threadId: roomId, // チャットルームIDをスレッドIDとして使用
          maxSteps: 30, // ツールの利用上限
          onFinish: () => {
            // ストリーミングが完了したときの処理
            // フロントエンドに完了通知を送信
            event.sender.send(IpcChannels.CHAT_COMPLETE);
          },
        });

        // DataStreamを生成
        const dataStream = createDataStream({
          execute(writer) {
            stream.mergeIntoDataStream(writer);
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
        console.error('AIエージェントとの通信中にエラーが発生:', error);
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
