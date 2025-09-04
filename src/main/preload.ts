// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  IpcChannels,
  IpcResponsePayload,
  IpcEventPayload,
  IpcRequestPayload,
} from './types/ipc';

export type Channels = (typeof IpcChannels)[keyof typeof IpcChannels];

const electronHandler = {
  settings: {
    // 設定の状態を取得する
    getStatus: (): Promise<
      IpcResponsePayload<typeof IpcChannels.GET_SETTINGS_STATUS>
    > => {
      return ipcRenderer.invoke(IpcChannels.GET_SETTINGS_STATUS);
    },
    // 設定を再初期化する
    reinitialize: async (): Promise<
      IpcResponsePayload<typeof IpcChannels.REINITIALIZE_SETTINGS>
    > => {
      return ipcRenderer.invoke(IpcChannels.REINITIALIZE_SETTINGS);
    },
    // 設定のメッセージを削除する
    removeMessage: async (
      messageId: string,
    ): Promise<
      IpcResponsePayload<typeof IpcChannels.REINITIALIZE_SETTINGS>
    > => {
      return ipcRenderer.invoke(IpcChannels.REMOVE_SETTINGS_MESSAGE, messageId);
    },
  },
  fs: {
    access: async (path: string): Promise<boolean> => {
      return ipcRenderer.invoke(IpcChannels.FS_CHECK_PATH_EXISTS, path);
    },
    showOpenDialog: async (options: {
      title: string;
      filters?: { name: string; extensions: string[] }[];
      properties?: string[];
    }) => {
      return ipcRenderer.invoke(IpcChannels.FS_SHOW_OPEN_DIALOG, options);
    },
    readFile: async (filePath: string): Promise<Uint8Array> => {
      return ipcRenderer.invoke(IpcChannels.FS_READ_FILE, filePath);
    },
  },
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
      return ipcRenderer.invoke(IpcChannels.SET_STORE_VALUE, key, value);
    },
  },
  chat: {
    // チャットメッセージを送信する
    sendMessage: async (
      params: IpcRequestPayload<typeof IpcChannels.CHAT_SEND_MESSAGE>,
    ): Promise<IpcResponsePayload<typeof IpcChannels.CHAT_SEND_MESSAGE>> => {
      return ipcRenderer.invoke(IpcChannels.CHAT_SEND_MESSAGE, params);
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
    // 新規スレッドを作成する
    createThread: (params: {
      roomId: string;
      title: string;
    }): Promise<IpcResponsePayload<typeof IpcChannels.CHAT_CREATE_THREAD>> => {
      return ipcRenderer.invoke(IpcChannels.CHAT_CREATE_THREAD, params);
    },
    // 生成を中断するリクエストを送信
    requestAbort: async (
      threadId: string,
    ): Promise<IpcResponsePayload<typeof IpcChannels.CHAT_ABORT_REQUEST>> => {
      return ipcRenderer.invoke(IpcChannels.CHAT_ABORT_REQUEST, threadId);
    },
    // メッセージ編集時に該当indexまでの履歴を削除する
    deleteMessagesBeforeSpecificId: async (
      params: IpcRequestPayload<
        typeof IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID
      >,
    ): Promise<
      IpcResponsePayload<
        typeof IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID
      >
    > => {
      return ipcRenderer.invoke(
        IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID,
        params,
      );
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
    // ソースの有効/無効状態を更新する
    updateSourceEnabled: async (
      sourceId: number,
      isEnabled: boolean,
    ): Promise<
      IpcResponsePayload<typeof IpcChannels.SOURCE_UPDATE_ENABLED>
    > => {
      return ipcRenderer.invoke(IpcChannels.SOURCE_UPDATE_ENABLED, {
        sourceId,
        isEnabled,
      });
    },
  },
  review: {
    // レビュー履歴一覧を取得する
    getHistories: async (): Promise<
      IpcResponsePayload<typeof IpcChannels.REVIEW_GET_HISTORIES>
    > => {
      return ipcRenderer.invoke(IpcChannels.REVIEW_GET_HISTORIES);
    },
    // レビュー履歴詳細を取得する
    getHistoryDetail: async (
      historyId: string,
    ): Promise<
      IpcResponsePayload<typeof IpcChannels.REVIEW_GET_HISTORY_DETAIL>
    > => {
      return ipcRenderer.invoke(
        IpcChannels.REVIEW_GET_HISTORY_DETAIL,
        historyId,
      );
    },
    // レビュー履歴を削除する
    deleteHistory: async (
      historyId: string,
    ): Promise<
      IpcResponsePayload<typeof IpcChannels.REVIEW_DELETE_HISTORY>
    > => {
      return ipcRenderer.invoke(IpcChannels.REVIEW_DELETE_HISTORY, historyId);
    },
    // チェックリストを抽出する
    extractChecklist: async (
      params: IpcRequestPayload<
        typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL
      >,
    ): Promise<
      IpcResponsePayload<typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL>
    > => {
      return ipcRenderer.invoke(
        IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL,
        params,
      );
    },
    // チェックリストを更新する
    updateChecklist: async (
      params: IpcRequestPayload<typeof IpcChannels.REVIEW_UPDATE_CHECKLIST>,
    ): Promise<
      IpcResponsePayload<typeof IpcChannels.REVIEW_UPDATE_CHECKLIST>
    > => {
      return ipcRenderer.invoke(IpcChannels.REVIEW_UPDATE_CHECKLIST, params);
    },
    // ドキュメントレビューを実行する
    execute: async (
      params: IpcRequestPayload<typeof IpcChannels.REVIEW_EXECUTE_CALL>,
    ): Promise<IpcResponsePayload<typeof IpcChannels.REVIEW_EXECUTE_CALL>> => {
      return ipcRenderer.invoke(IpcChannels.REVIEW_EXECUTE_CALL, params);
    },
    // チェックリスト抽出完了イベントを購読する
    onExtractChecklistFinished: (
      callback: (
        payload: IpcEventPayload<
          typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED
        >,
      ) => void,
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        payload: IpcEventPayload<
          typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED
        >,
      ) => {
        callback(payload);
      };
      ipcRenderer.on(
        IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
        subscription,
      );
      return () => {
        ipcRenderer.removeListener(
          IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
          subscription,
        );
      };
    },
    // ドキュメントレビュー実行完了イベントを購読する
    onExecuteReviewFinished: (
      callback: (
        payload: IpcEventPayload<typeof IpcChannels.REVIEW_EXECUTE_FINISHED>,
      ) => void,
    ) => {
      const subscription = (
        _event: IpcRendererEvent,
        payload: IpcEventPayload<typeof IpcChannels.REVIEW_EXECUTE_FINISHED>,
      ) => {
        callback(payload);
      };
      ipcRenderer.on(IpcChannels.REVIEW_EXECUTE_FINISHED, subscription);
      return () => {
        ipcRenderer.removeListener(
          IpcChannels.REVIEW_EXECUTE_FINISHED,
          subscription,
        );
      };
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
