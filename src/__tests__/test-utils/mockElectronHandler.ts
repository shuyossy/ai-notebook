import type { ElectronHandler } from '../../main/preload';
import type { StoreSchema as Settings } from '../../main/store';
import type { Source } from '../../db/schema';
import type { ChatRoom, AgentBootStatus } from '../../main/types';

/**
 * Mockメソッドの型を定義
 */
type MockFunction<T> = T extends (...args: any[]) => any
  ? jest.Mock<ReturnType<T>, Parameters<T>>
  : never;

/**
 * ElectronHandlerの各メソッドをMock化
 */
export type MockHandler<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? MockFunction<T[K]>
    : T[K] extends object
    ? MockHandler<T[K]>
    : T[K];
};

export type ElectronMock = MockHandler<ElectronHandler>;

/**
 * デフォルトの設定値を生成
 */
export const createDefaultMockSettings = (): Settings => ({
  database: {
    dir: '/test/db',
  },
  source: {
    registerDir: './test/source',
  },
  api: {
    key: 'test-api-key',
    url: 'https://api.test.com',
    model: 'test-model',
  },
  redmine: {
    endpoint: 'https://redmine.test.com',
    apiKey: 'test-redmine-key',
  },
  gitlab: {
    endpoint: 'https://gitlab.test.com',
    apiKey: 'test-gitlab-key',
  },
  mcp: {
    serverConfigText: '{"testMcp": {"url": "https://mcp.test.com"} }',
  },
  systemPrompt: {
    content: 'test system prompt',
  },
});

/**
 * モックオプションのインターフェース
 */
export interface MockOptions {
  initialSettings?: Partial<Settings>;
  sources?: Source[];
  chatRooms?: ChatRoom[];
  sourceEnabled?: boolean;
  fsAccess?: boolean;
  agentStatus?: Partial<AgentBootStatus>;
}

/**
 * オプション付きでモックを生成する関数
 */
export const createMockElectronWithOptions = (
  options: MockOptions = {},
): ElectronHandler => {
  const settings = options.initialSettings
    ? { ...createDefaultMockSettings(), ...options.initialSettings }
    : createDefaultMockSettings();

  const mockHandlers = {
    agent: {
      getStatus: jest.fn().mockReturnValue(options.agentStatus || {
        state: 'ready',
        messages: [],
        tools: {
          redmine: false,
          gitlab: false,
          mcp: false,
        },
      }),
      reinitialize: jest.fn().mockResolvedValue(undefined),
      removeMessage: jest.fn(),
    },
    fs: {
      access: jest.fn().mockResolvedValue(options.fsAccess ?? true),
    },
    store: {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'all') return settings;
        return settings[key as keyof Settings];
      }),
      set: jest.fn().mockResolvedValue(undefined),
    },
    chat: {
      sendMessage: jest.fn(),
      getRooms: jest.fn().mockResolvedValue(options.chatRooms ?? []),
      getMessages: jest.fn().mockResolvedValue([]),
      deleteRoom: jest.fn().mockResolvedValue({ success: true }),
      createThread: jest.fn().mockResolvedValue({
        success: true
      }),
      onError: jest.fn(),
      onStream: jest.fn(),
      onComplete: jest.fn(),
      editHistory: jest.fn(),
    },
    source: {
      reloadSources: jest.fn().mockResolvedValue({
        success: true,
        message: 'Source reloaded successfully',
      }),
      getSources: jest.fn().mockResolvedValue({
        success: true,
        sources: options.sources ?? [],
      }),
      updateSourceEnabled: jest.fn().mockResolvedValue({
        success: true,
      }),
    },
    ipcRenderer: {
      sendMessage: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    },
  };

  return mockHandlers as ElectronMock;
};

/**
 * 後方互換性のために残す
 * @deprecated Use createMockElectronWithOptions instead
 */
export const createMockElectron = createMockElectronWithOptions;
