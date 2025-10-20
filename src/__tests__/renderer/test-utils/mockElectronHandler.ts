import type { ElectronHandler } from '@/main/preload';
import type { Source, ChatRoom, SettingsSavingStatus, Settings, ChatMessage } from '@/types';
import type { IpcChannels, IpcResponsePayloadMap } from '@/types/ipc';

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
    serverConfig: { testMcp: { url: new URL('https://mcp.test.com') } },
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
  chatMessages?: ChatMessage[];
  sourceEnabled?: boolean;
  fsAccess?: boolean;
  settingsStatus?: SettingsSavingStatus;
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
    settings: {
      getStatus: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.GET_SETTINGS_STATUS]>, []>()
        .mockResolvedValue({
          success: true,
          data: options.settingsStatus || {
            state: 'done',
            messages: [],
            tools: {
              document: false,
              redmine: false,
              gitlab: false,
              mcp: false,
            },
          },
        }),
      reinitialize: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REINITIALIZE_SETTINGS]>, []>()
        .mockResolvedValue({ success: true }),
      removeMessage: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REMOVE_SETTINGS_MESSAGE]>, [string]>()
        .mockResolvedValue({ success: true }),
      getSettings: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.GET_SETTINGS]>, []>()
        .mockResolvedValue({ success: true, data: settings }),
      setSettings: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.SET_SETTINGS]>, [Settings]>()
        .mockResolvedValue({ success: true, data: true }),
    },
    fs: {
      access: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.FS_CHECK_PATH_EXISTS]>, [string]>()
        .mockResolvedValue({ success: true, data: options.fsAccess ?? true }),
      showOpenDialog: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.FS_SHOW_OPEN_DIALOG]>, [any]>()
        .mockResolvedValue({
          success: true,
          data: { filePaths: [], canceled: false },
        }),
      readFile: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.FS_READ_FILE]>, [string]>()
        .mockResolvedValue({
          success: true,
          data: new Uint8Array(),
        }),
      convertOfficeToPdf: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.FS_CONVERT_OFFICE_TO_PDF]>, [string]>()
        .mockResolvedValue({
          success: true,
          data: new Uint8Array(),
        }),
    },
    chat: {
      sendMessage: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_SEND_MESSAGE]>, [any]>()
        .mockResolvedValue({ success: true }),
      getRooms: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_GET_ROOMS]>, []>()
        .mockResolvedValue({ success: true, data: options.chatRooms ?? [] }),
      getMessages: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_GET_MESSAGES]>, [string]>()
        .mockResolvedValue({ success: true, data: options.chatMessages ?? [] }),
      deleteRoom: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_DELETE_ROOM]>, [string]>()
        .mockResolvedValue({ success: true }),
      createThread: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_CREATE_THREAD]>, [any]>()
        .mockResolvedValue({ success: true }),
      requestAbort: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_ABORT_REQUEST]>, [any]>()
        .mockResolvedValue({ success: true }),
      deleteMessagesBeforeSpecificId: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID]>, [any]>()
        .mockResolvedValue({ success: true }),
    },
    source: {
      reloadSources: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.SOURCE_RELOAD]>, []>()
        .mockResolvedValue({
          success: true,
          data: { message: 'Source reloaded successfully' },
        }),
      getSources: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.SOURCE_GET_ALL]>, []>()
        .mockResolvedValue({
          success: true,
          data: options.sources ?? [],
        }),
      updateSourceEnabled: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.SOURCE_UPDATE_ENABLED]>, [any]>()
        .mockResolvedValue({
          success: true,
        }),
    },
    ipcRenderer: {
      sendMessage: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    },
    pushApi: {
      subscribe: jest.fn<Promise<() => void>, [any, any]>().mockResolvedValue(() => {}),
    },
    review: {
      getHistories: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_GET_HISTORIES]>, []>()
        .mockResolvedValue({ success: true, data: [] }),
      getHistoryById: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_GET_HISTORY_BY_ID]>, [string]>()
        .mockResolvedValue({ success: true, data: null }),
      getHistoryDetail: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_GET_HISTORY_DETAIL]>, [string]>()
        .mockResolvedValue({ success: true, data: {} }),
      getHistoryInstruction: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_GET_HISTORY_INSTRUCTION]>, [string]>()
        .mockResolvedValue({ success: true, data: {} }),
      deleteHistory: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_DELETE_HISTORY]>, [string]>()
        .mockResolvedValue({ success: true }),
      extractChecklist: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]>, [any]>()
        .mockResolvedValue({ success: true }),
      abortExtractChecklist: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_ABORT]>, [string]>()
        .mockResolvedValue({ success: true }),
      updateChecklist: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_UPDATE_CHECKLIST]>, [any]>()
        .mockResolvedValue({ success: true }),
      execute: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL]>, [any]>()
        .mockResolvedValue({ success: true }),
      abortExecute: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_EXECUTE_ABORT]>, [string]>()
        .mockResolvedValue({ success: true }),
      sendChatMessage: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_CHAT_SEND_MESSAGE]>, [any]>()
        .mockResolvedValue({ success: true }),
      abortChat: jest
        .fn<Promise<IpcResponsePayloadMap[typeof IpcChannels.REVIEW_CHAT_ABORT]>, [string]>()
        .mockResolvedValue({ success: true }),
    },
  };

  return mockHandlers as ElectronMock;
};

/**
 * 後方互換性のために残す
 * @deprecated Use createMockElectronWithOptions instead
 */
export const createMockElectron = createMockElectronWithOptions;
