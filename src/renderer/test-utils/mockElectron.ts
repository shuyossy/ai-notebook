import type { ElectronHandler } from '../../main/preload';

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
 * デフォルトのモック実装を作成
 */
export const createMockElectron = (): ElectronHandler => ({
  agent: {
    getStatus: jest.fn(),
    reinitialize: jest.fn(),
    removeMessage: jest.fn(),
  },
  fs: {
    access: jest.fn(),
  },
  store: {
    get: jest.fn(),
    set: jest.fn(),
  },
  chat: {
    sendMessage: jest.fn(),
    getRooms: jest.fn(),
    getMessages: jest.fn(),
    deleteRoom: jest.fn(),
    createThread: jest.fn(),
    onError: jest.fn(),
    onStream: jest.fn(),
    onComplete: jest.fn(),
  },
  source: {
    reloadSources: jest.fn(),
    getSources: jest.fn(),
    updateSourceEnabled: jest.fn(),
  },
  ipcRenderer: {
    sendMessage: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
  },
}) as ElectronMock;
