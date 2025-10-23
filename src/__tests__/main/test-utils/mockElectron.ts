/**
 * Main プロセステスト用の Electron モック
 *
 * Electron の app モジュールなどをモック化して、
 * テスト環境でも正常に動作するようにする
 */

import path from 'path';

// テスト用のデータディレクトリ
const TEST_USER_DATA_PATH = path.join(__dirname, '..', '..', '..', '..', 'test_data');

/**
 * Electron の app モジュールのモック
 */
const mockApp = {
  // 開発モードとして動作（パッケージ版ではない）
  isPackaged: false,

  // アプリの準備完了状態（electron-log で使用）
  isReady: jest.fn(() => Promise.resolve()),

  // whenReady も追加（electron-log で使用される可能性がある）
  whenReady: jest.fn(() => Promise.resolve()),

  // ユーザーデータディレクトリを返す
  getPath: jest.fn((name: string) => {
    if (name === 'userData') {
      return TEST_USER_DATA_PATH;
    }
    return TEST_USER_DATA_PATH;
  }),

  // パスの設定（何もしない）
  setPath: jest.fn(),

  // その他必要に応じて追加
  getName: jest.fn(() => 'test-app'),
  getVersion: jest.fn(() => '1.0.0'),

  // イベントリスナー関連（electron-log で使用）
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
};

/**
 * Electron モジュール全体のモック
 */
export const mockElectron = {
  app: mockApp,

  // 必要に応じて他のモジュールも追加
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeHandler: jest.fn(),
  },

  BrowserWindow: jest.fn(),

  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showMessageBox: jest.fn(),
  },

  shell: {
    openExternal: jest.fn(),
  },

  // crashReporter のモック
  crashReporter: {
    start: jest.fn(),
    getLastCrashReport: jest.fn(),
    getUploadedReports: jest.fn(),
    getUploadToServer: jest.fn(),
    setUploadToServer: jest.fn(),
  },
};

/**
 * electron-store モジュールのモック
 *
 * electron-store は内部で Electron の app を使用するため、
 * テスト環境では簡易的なインメモリストアに置き換える
 */
export class MockStore<T extends Record<string, any> = Record<string, any>> {
  private data: Map<string, any> = new Map();

  constructor(options?: { defaults?: T; schema?: any; cwd?: string }) {
    if (options?.defaults) {
      // デフォルト値を設定
      Object.entries(options.defaults).forEach(([key, value]) => {
        this.data.set(key, value);
      });
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data.get(key as string);
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data.set(key as string, value);
  }

  has(key: keyof T): boolean {
    return this.data.has(key as string);
  }

  delete(key: keyof T): void {
    this.data.delete(key as string);
  }

  clear(): void {
    this.data.clear();
  }

  // Store 全体を取得
  store: T = new Proxy({} as T, {
    get: (_, prop) => this.data.get(prop as string),
    set: (_, prop, value) => {
      this.data.set(prop as string, value);
      return true;
    },
  });
}

// デフォルトエクスポート（electron-store の代替）
export default MockStore;
