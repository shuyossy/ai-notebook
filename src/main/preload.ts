// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannels, IpcResponsePayload, IpcEventPayload } from './types/ipc';

export type Channels = (typeof IpcChannels)[keyof typeof IpcChannels];

const electronHandler = {
  store: {
    get: async (
      key: string,
    ): Promise<IpcResponsePayload<typeof IpcChannels.GET_STORE_VALUE>> => {
      return ipcRenderer.invoke(IpcChannels.GET_STORE_VALUE, key);
    },
    set: async (
      key: string,
      value: unknown,
    ): Promise<IpcResponsePayload<typeof IpcChannels.SET_STORE_VALUE>> => {
      return ipcRenderer.invoke(IpcChannels.SET_STORE_VALUE, { key, value });
    },
  },
  chat: {
    // チャットメッセージを送信する
    sendMessage: async (
      roomId: string,
      content: string,
    ): Promise<IpcResponsePayload<typeof IpcChannels.CHAT_SEND_MESSAGE>> => {
      return ipcRenderer.invoke(IpcChannels.CHAT_SEND_MESSAGE, {
        roomId,
        content,
      });
    },
    // チャットルーム一覧を取得する
    getRooms: async (): Promise<
      IpcResponsePayload<typeof IpcChannels.CHAT_GET_ROOMS>
    > => {
      return ipcRenderer.invoke(IpcChannels.CHAT_GET_ROOMS);
    },
    // チャットメッセージ履歴を取得する
    getMessages: async (
      threadId: string,
    ): Promise<IpcResponsePayload<typeof IpcChannels.CHAT_GET_MESSAGES>> => {
      return ipcRenderer.invoke(IpcChannels.CHAT_GET_MESSAGES, threadId);
    },
    // チャットルームを削除する
    deleteRoom: async (
      threadId: string,
    ): Promise<IpcResponsePayload<typeof IpcChannels.CHAT_DELETE_ROOM>> => {
      return ipcRenderer.invoke(IpcChannels.CHAT_DELETE_ROOM, threadId);
    },
    // AIの応答を取得する（ストリーミング）
    onStream: (
      callback: (
        chunk: IpcEventPayload<typeof IpcChannels.CHAT_STREAM>,
      ) => void,
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        chunk: IpcEventPayload<typeof IpcChannels.CHAT_STREAM>,
      ) => {
        callback(chunk);
      };
      ipcRenderer.on(IpcChannels.CHAT_STREAM, subscription);
      return () => {
        ipcRenderer.removeListener(IpcChannels.CHAT_STREAM, subscription);
      };
    },
    // AIの応答完了イベント
    onComplete: (callback: () => void) => {
      // eslint-disable-next-line
      const subscription = (_event: IpcRendererEvent) => {
        callback();
      };
      ipcRenderer.on(IpcChannels.CHAT_COMPLETE, subscription);
      return () => {
        ipcRenderer.removeListener(IpcChannels.CHAT_COMPLETE, subscription);
      };
    },
    // エラーイベント
    onError: (
      callback: (error: IpcEventPayload<typeof IpcChannels.CHAT_ERROR>) => void,
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        error: IpcEventPayload<typeof IpcChannels.CHAT_ERROR>,
      ) => {
        callback(error);
      };
      ipcRenderer.on(IpcChannels.CHAT_ERROR, subscription);
      return () => {
        ipcRenderer.removeListener(IpcChannels.CHAT_ERROR, subscription);
      };
    },
  },
  source: {
    // ソースの再読み込みを実行する
    reloadSources: async (): Promise<
      IpcResponsePayload<typeof IpcChannels.SOURCE_RELOAD>
    > => {
      return ipcRenderer.invoke(IpcChannels.SOURCE_RELOAD);
    },
    // ソース一覧を取得する
    getSources: async (): Promise<
      IpcResponsePayload<typeof IpcChannels.SOURCE_GET_ALL>
    > => {
      return ipcRenderer.invoke(IpcChannels.SOURCE_GET_ALL);
    },
  },
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
