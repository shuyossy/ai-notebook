import path, { join } from 'path';
import { app } from 'electron';

// 設定の型定義
export interface StoreSchema {
  database: {
    dir: string;
  };
  source: {
    registerDir: string;
  };
  api: {
    key: string;
    url: string;
    model: string;
  };
  redmine: {
    endpoint: string;
    apiKey: string;
  };
  gitlab: {
    endpoint: string;
    apiKey: string;
  };
  mcp: {
    serverConfigText: string;
  };
}

// スキーマ定義
const schema = {
  database: {
    type: 'object',
    properties: {
      dir: { type: 'string' },
    },
    required: ['dir'],
  },
  source: {
    type: 'object',
    properties: {
      registerDir: { type: 'string' },
    },
    required: ['registerDir'],
  },
  api: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      url: { type: 'string' },
      model: { type: 'string' },
    },
    required: ['key', 'url', 'model'],
  },
  redmine: {
    type: 'object',
    properties: {
      endpoint: { type: 'string' },
      apiKey: { type: 'string' },
    },
    required: [],
  },
  gitlab: {
    type: 'object',
    properties: {
      endpoint: { type: 'string' },
      apiKey: { type: 'string' },
    },
    required: [],
  },
  mcp: {
    type: 'object',
    properties: {
      serverConfigText: {
        type: 'string',
        default: '{}',
      },
    },
    required: [],
  },
} as const;

/**
 * config.json を収納するディレクトリを決定する
 *
 * 1. Windows Portable   : PORTABLE_EXECUTABLE_DIR
 * 2. Windows Installer  : exe と同階層
 * 3. macOS / Linux      : userData（書き込み可）
 * 4. 開発時             : プロジェクトのルート
 */
function getConfigDir(): string {
  // --- ① Windows Portable (.exe 単体) --------------------------
  // electron-builder の Portable テンプレートが自動で環境変数をセット
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }

  // --- ② パッケージ版 (app.isPackaged === true) ---------------
  if (app.isPackaged) {
    // macOS .app や Linux AppImage は execPath 周辺が書き込み不可
    if (process.platform === 'darwin' || process.platform === 'linux') {
      return app.getPath('userData'); // ユーザ領域へ退避
    }
    // Windows インストーラ版は exe と同階層 （Program Files でも書き込める）
    return path.dirname(process.execPath);
  }

  // --- ③ 開発時 (electron . / npm start) -----------------------
  // execPath は node_modules 内の Electron バイナリ ⇒ プロジェクト直下へ補正
  return join(__dirname, '..', '..', 'electron-store');
}

// デフォルト値の設定
const defaults: StoreSchema = {
  database: {
    dir: './default_data_dir',
  },
  source: {
    registerDir: './default_data_dir',
  },
  api: {
    key: '',
    url: '',
    model: '',
  },
  redmine: {
    endpoint: '',
    apiKey: '',
  },
  gitlab: {
    endpoint: '',
    apiKey: '',
  },
  mcp: {
    serverConfigText: '{}',
  },
};

// ストアのインスタンスを作成する関数
export async function createStore() {
  const Store = (await import('electron-store')).default;
  const store = new Store<StoreSchema>({
    schema,
    defaults,
    // アプリのユーザーデータディレクトリ内のconfigフォルダに保存
    // cwd: path.join(app.getPath('userData'), 'config'),
    cwd: getConfigDir(),
  });

  console.log('storeのインスタンス化に成功しました: ', store.store);

  return store;
}

// グローバルなストアインスタンス
let store: Awaited<ReturnType<typeof createStore>>;

// ストアを初期化する関数
export async function initStore() {
  if (!store) {
    store = await createStore();
  }
  return store;
}

// ストアを取得する関数
export function getStore() {
  if (!store) {
    throw new Error('Store has not been initialized. Call initStore() first.');
  }
  return store;
}
