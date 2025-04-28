import path from 'path';
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
    required: ['endpoint', 'apiKey'],
  },
  gitlab: {
    type: 'object',
    properties: {
      endpoint: { type: 'string' },
      apiKey: { type: 'string' },
    },
    required: ['endpoint', 'apiKey'],
  },
} as const;

// デフォルト値の設定
const defaults: StoreSchema = {
  database: {
    dir: '',
  },
  source: {
    registerDir: './source',
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
};

// ストアのインスタンスを作成する関数
export async function createStore() {
  const Store = (await import('electron-store')).default;
  const store = new Store<StoreSchema>({
    schema,
    defaults,
    // アプリのユーザーデータディレクトリ内のconfigフォルダに保存
    cwd: path.join(app.getPath('userData'), 'config'),
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
