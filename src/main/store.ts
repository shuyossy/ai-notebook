// @ts-ignore
import Store from 'electron-store';
import { getCustomAppDataDir } from './main';
// 設定の型定義
export interface StoreSchema {
  database: {
    dir: string;
  };
  source: {
    registerDir?: string;
  };
  api: {
    key: string;
    url: string;
    model: string;
  };
  redmine: {
    endpoint?: string;
    apiKey?: string;
  };
  gitlab: {
    endpoint?: string;
    apiKey?: string;
  };
  mcp: {
    serverConfig?: string;
  };
  systemPrompt: {
    content?: string;
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
  },
  gitlab: {
    type: 'object',
    properties: {
      endpoint: { type: 'string' },
      apiKey: { type: 'string' },
    },
  },
  mcp: {
    type: 'object',
    properties: {
      serverConfigText: {
        type: 'string',
        default: '',
      },
    },
  },
  systemPrompt: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
      },
    },
  },
} as const;

// デフォルト値の設定
const defaults: StoreSchema = {
  database: {
    dir: getCustomAppDataDir(),
  },
  source: {
    registerDir: undefined,
  },
  api: {
    key: 'aaa',
    url: 'http://localhost',
    model: 'aaa',
  },
  redmine: {
    endpoint: undefined,
    apiKey: undefined,
  },
  gitlab: {
    endpoint: undefined,
    apiKey: undefined,
  },
  mcp: {
    serverConfig: undefined,
  },
  systemPrompt: {
    content: undefined,
  },
};

// グローバルなストアインスタンス
const store = new Store<StoreSchema>({
  schema,
  defaults,
  // アプリのユーザーデータディレクトリ内のconfigフォルダに保存
  // cwd: path.join(app.getPath('userData'), 'config'),
  cwd: getCustomAppDataDir(),
});

// ストアを取得する関数
export function getStore() {
  if (!store) {
    throw new Error('Store has not been initialized.');
  }
  return store;
}
