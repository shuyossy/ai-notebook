// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  IpcChannels,
  RequestChannel,
  ResponseChannel,
  IpcRequestPayloadMap,
  IpcResponsePayloadMap,
  EventChannel,
  IpcEventPayloadMap,
  IpcNameMap,
} from '@/types';
import { normalizeUnkhownIpcError, toPayload } from './lib/error';
import { getRendererLogger } from '@/renderer/lib/logger';

export type Channels = (typeof IpcChannels)[keyof typeof IpcChannels];

/** C の引数を「undefined のときは引数なし、そうでなければ 1 引数」にする補助型 */
type ArgOf<C extends RequestChannel> = IpcRequestPayloadMap[C] extends undefined
  ? []
  : [IpcRequestPayloadMap[C]];

/**
 * すべての ipcRenderer.invoke をここで一元化。
 * どのチャンネルでも、成功は {ok:true,data}、失敗は {ok:false,error} を返す。
 * Mainのhandler側で例外を握っているので、Renderer側でtry/catchする必要は基本的にない
 * 起動直後でMain側がまだ準備できていない場合などに例外が発生する可能性はある
 */
export async function invokeIpc<C extends RequestChannel & ResponseChannel>(
  channel: C,
  ...args: ArgOf<C> | []
): Promise<IpcResponsePayloadMap[C]> {
  const logger = getRendererLogger();
  try {
    const res = await ipcRenderer.invoke(channel, ...(args as any[]));

    // 既に IpcResult で返ってきていればそのまま
    if (res && typeof res === 'object' && 'success' in res) {
      return res as IpcResponsePayloadMap[C];
    }
    // 素の値は success: true で包む
    return { success: true, data: res } as IpcResponsePayloadMap[C];
  } catch (err: unknown) {
    const error = normalizeUnkhownIpcError(err, IpcNameMap[channel]);
    logger.error(error, `IPC ${channel} error`);
    return {
      success: false,
      error: toPayload(error),
    } as IpcResponsePayloadMap[C];
  }
}

export function onIpc<C extends EventChannel>(
  channel: C,
  cb: (payload: IpcEventPayloadMap[C]) => void,
) {
  const sub = (_e: IpcRendererEvent, payload: IpcEventPayloadMap[C]) =>
    cb(payload);
  ipcRenderer.on(channel, sub);
  return () => ipcRenderer.removeListener(channel, sub);
}

const electronHandler = {
  settings: {
    // 設定の状態を取得する
    getStatus: () => invokeIpc(IpcChannels.GET_SETTINGS_STATUS),
    // 設定を再初期化する
    reinitialize: () => invokeIpc(IpcChannels.REINITIALIZE_SETTINGS),
    // 設定のメッセージを削除する
    removeMessage: (messageId: string) =>
      invokeIpc(IpcChannels.REMOVE_SETTINGS_MESSAGE, messageId),
  },
  fs: {
    /** パスが存在するか */
    access: (path: string) => invokeIpc(IpcChannels.FS_CHECK_PATH_EXISTS, path),
    /** ファイル選択ダイアログ */
    showOpenDialog: (options:
      IpcRequestPayloadMap[typeof IpcChannels.FS_SHOW_OPEN_DIALOG],
    ) => invokeIpc(IpcChannels.FS_SHOW_OPEN_DIALOG, options),
    /** ファイル読み込み（Uint8Array） */
    readFile: (filePath: string) =>
      invokeIpc(IpcChannels.FS_READ_FILE, filePath),
  },
  store: {
    store: {
      get: (key: string) => invokeIpc(IpcChannels.GET_STORE_VALUE, key),
      set: (options: { key: string; value: unknown }) =>
        invokeIpc(IpcChannels.SET_STORE_VALUE, options),
    },
  },
  chat: {
    /** チャットメッセージ送信 */
    sendMessage: (
      params: IpcRequestPayloadMap[typeof IpcChannels.CHAT_SEND_MESSAGE],
    ) => invokeIpc(IpcChannels.CHAT_SEND_MESSAGE, params),
    /** ルーム一覧取得 */
    getRooms: () => invokeIpc(IpcChannels.CHAT_GET_ROOMS),
    /** メッセージ履歴取得 */
    getMessages: (threadId: string) =>
      invokeIpc(IpcChannels.CHAT_GET_MESSAGES, threadId),
    /** ルーム削除 */
    deleteRoom: (threadId: string) =>
      invokeIpc(IpcChannels.CHAT_DELETE_ROOM, threadId),
    /** スレッド作成 */
    createThread: (
      params: IpcRequestPayloadMap[typeof IpcChannels.CHAT_CREATE_THREAD],
    ) => invokeIpc(IpcChannels.CHAT_CREATE_THREAD, params),
    /** 中断リクエスト */
    requestAbort: (
      params: IpcRequestPayloadMap[typeof IpcChannels.CHAT_ABORT_REQUEST],
    ) => invokeIpc(IpcChannels.CHAT_ABORT_REQUEST, params),
    /** 指定メッセージID以前を削除 */
    deleteMessagesBeforeSpecificId: (
      params: IpcRequestPayloadMap[typeof IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID],
    ) => invokeIpc(IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID, params),

    /** ストリーム受信（push） */
    onStream: (
      callback: (
        payload: IpcEventPayloadMap[typeof IpcChannels.CHAT_STREAM],
      ) => void,
    ) => onIpc(IpcChannels.CHAT_STREAM, callback),
    /** 完了イベント（push） */
    onComplete: (
      callback: () => void,
    ) => onIpc(IpcChannels.CHAT_COMPLETE, () => callback()),
    /** エラーイベント（push） */
    onError: (
      callback: (p: IpcEventPayloadMap[typeof IpcChannels.CHAT_ERROR]) => void,
    ) => onIpc(IpcChannels.CHAT_ERROR, callback),
  },
  source: {
    /** ソース再読み込み */
    reloadSources: () => invokeIpc(IpcChannels.SOURCE_RELOAD),
    /** ソース一覧 */
    getSources: () => invokeIpc(IpcChannels.SOURCE_GET_ALL),
    /** 有効/無効更新 */
    updateSourceEnabled: (params: IpcRequestPayloadMap[typeof IpcChannels.SOURCE_UPDATE_ENABLED]) =>
      invokeIpc(IpcChannels.SOURCE_UPDATE_ENABLED, params),
  },
  review: {
    /** レビュー履歴一覧 */
    getHistories: () => invokeIpc(IpcChannels.REVIEW_GET_HISTORIES),
    /** 履歴詳細 */
    getHistoryDetail: (historyId: string) =>
      invokeIpc(IpcChannels.REVIEW_GET_HISTORY_DETAIL, historyId),
    /** 履歴削除 */
    deleteHistory: (historyId: string) =>
      invokeIpc(IpcChannels.REVIEW_DELETE_HISTORY, historyId),
    /** チェックリスト抽出 */
    extractChecklist: (
      params: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL],
    ) => invokeIpc(IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL, params),
    /** チェックリスト更新 */
    updateChecklist: (
      params: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_UPDATE_CHECKLIST],
    ) => invokeIpc(IpcChannels.REVIEW_UPDATE_CHECKLIST, params),
    /** レビュー実行 */
    execute: (
      params: IpcRequestPayloadMap[typeof IpcChannels.REVIEW_EXECUTE_CALL],
    ) => invokeIpc(IpcChannels.REVIEW_EXECUTE_CALL, params),

    /** 抽出完了イベント（push） */
    onExtractChecklistFinished: (
      cb: (
        p: IpcEventPayloadMap[typeof IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED],
      ) => void,
    ) => onIpc(IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED, cb),
    /** 実行完了イベント（push） */
    onExecuteReviewFinished: (
      cb: (
        p: IpcEventPayloadMap[typeof IpcChannels.REVIEW_EXECUTE_FINISHED],
      ) => void,
    ) => onIpc(IpcChannels.REVIEW_EXECUTE_FINISHED, cb),
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
