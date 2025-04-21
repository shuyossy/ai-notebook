// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'get-store-value'
  | 'set-store-value'
  | 'chat-message'
  | 'chat-stream'
  | 'chat-error';

const electronHandler = {
  store: {
    get: async (key: string) => {
      return ipcRenderer.invoke('get-store-value', key);
    },
    set: async (key: string, value: unknown) => {
      return ipcRenderer.invoke('set-store-value', key, value);
    },
  },
  chat: {
    // チャットメッセージを送信する
    sendMessage: async (roomId: string, message: string) => {
      return ipcRenderer.invoke('chat-send-message', { roomId, message });
    },
    // AIの応答を取得する（ストリーミング）
    onStream: (callback: (chunk: string) => void) => {
      const subscription = (_event: IpcRendererEvent, chunk: string) => {
        callback(chunk);
      };
      ipcRenderer.on('chat-stream', subscription);
      return () => {
        ipcRenderer.removeListener('chat-stream', subscription);
      };
    },
    // AIの応答完了イベント
    onComplete: (callback: (response: any) => void) => {
      const subscription = (_event: IpcRendererEvent, response: any) => {
        callback(response);
      };
      ipcRenderer.on('chat-complete', subscription);
      return () => {
        ipcRenderer.removeListener('chat-complete', subscription);
      };
    },
    // エラーイベント
    onError: (callback: (error: any) => void) => {
      const subscription = (_event: IpcRendererEvent, error: any) => {
        callback(error);
      };
      ipcRenderer.on('chat-error', subscription);
      return () => {
        ipcRenderer.removeListener('chat-error', subscription);
      };
    },
  },
  source: {
    // ソースの再読み込みを実行する
    reloadSources: async () => {
      return ipcRenderer.invoke('source-reload');
    },
    // ソース一覧を取得する
    getSources: async () => {
      return ipcRenderer.invoke('source-get-all');
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
