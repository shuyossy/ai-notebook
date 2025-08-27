import type {
  ChatMessage,
  ChatRoom,
  SettingsSavingStatus,
  ReviewChecklistResult,
  ReviewChecklistEdit,
} from '.';
import type { Source, ReviewHistory } from '../../db/schema';
import type { DocumentType } from '../../renderer/components/review/types';

/**
 * IPC通信で使用するチャネル名の定義
 */
export const IpcChannels = {
  // Agent関連
  GET_SETTINGS_STATUS: 'get-settings-status',
  SETTINGS_STATUS_CHANGED: 'settings-status-changed',
  REINITIALIZE_SETTINGS: 'reinitialize-settings',
  REMOVE_SETTINGS_MESSAGE: 'remove-settings-message',

  // ストア関連
  GET_STORE_VALUE: 'get-store-value',
  SET_STORE_VALUE: 'set-store-value',

  // ソース関連
  SOURCE_GET_ALL: 'source-get-all',
  SOURCE_RELOAD: 'source-reload',
  SOURCE_UPDATE_ENABLED: 'source-update-enabled',

  // チャット関連
  CHAT_SEND_MESSAGE: 'chat-send-message',
  CHAT_GET_ROOMS: 'chat-get-rooms',
  CHAT_GET_MESSAGES: 'chat-get-messages',
  CHAT_DELETE_ROOM: 'chat-delete-room',
  CHAT_CREATE_THREAD: 'chat-create-thread',
  CHAT_STREAM: 'chat-stream',
  CHAT_COMPLETE: 'chat-complete',
  CHAT_STEP: 'chat-step',
  CHAT_ERROR: 'chat-error',
  CHAT_ABORT_REQUEST: 'chat-abort-request',
  CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID:
    'chat-delete-messages-before-specific-id',

  // ファイルシステム関連
  FS_CHECK_PATH_EXISTS: 'fs-check-path-exists',

  // ドキュメントレビュー関連
  REVIEW_GET_HISTORIES: 'review-get-histories', // ドキュメント履歴切り替え時やチェックリスト抽出・ドキュメントレビュー時のポーリング処理にて呼び出される
  REVIEW_GET_HISTORY_DETAIL: 'review-get-history-detail',
  REVIEW_DELETE_HISTORY: 'review-delete-history',
  REVIEW_EXTRACT_CHECKLIST_CALL: 'review-extract-checklist-call', // チェックリスト抽出処理を開始する
  REVIEW_EXTRACT_CHECKLIST_FINISHED: 'review-extract-checklist-finished', // チェックリスト抽出が完了した際の通知
  REVIEW_UPDATE_CHECKLIST: 'review-update-checklist',
  REVIEW_EXECUTE_CALL: 'review-execute', // ドキュメントレビューを開始する
  REVIEW_EXECUTE_FINISHED: 'review-execute-finished', // レビュー実行が完了した際の通知
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/**
 * IPC通信のペイロード型マッピング
 * 各チャネルごとにリクエストとレスポンスの型を厳密に定義
 */
export type IpcRequestPayloadMap = {
  // Mastra関連
  [IpcChannels.REINITIALIZE_SETTINGS]: undefined;
  [IpcChannels.REMOVE_SETTINGS_MESSAGE]: string; // message id

  // ファイルシステム関連
  [IpcChannels.FS_CHECK_PATH_EXISTS]: string;

  // ストア関連
  [IpcChannels.GET_STORE_VALUE]: string;
  [IpcChannels.SET_STORE_VALUE]: { key: string; value: unknown };

  // ソース関連
  [IpcChannels.SOURCE_GET_ALL]: undefined;
  [IpcChannels.SOURCE_RELOAD]: undefined;
  [IpcChannels.SOURCE_UPDATE_ENABLED]: { sourceId: number; isEnabled: boolean };

  // チャット関連
  [IpcChannels.CHAT_SEND_MESSAGE]: { roomId: string; messages: ChatMessage[] };
  [IpcChannels.CHAT_GET_ROOMS]: undefined;
  [IpcChannels.CHAT_GET_MESSAGES]: string; // threadId
  [IpcChannels.CHAT_DELETE_ROOM]: string; // threadId
  [IpcChannels.CHAT_CREATE_THREAD]: {
    roomId: string;
    title: string;
  };
  [IpcChannels.CHAT_ABORT_REQUEST]: { threadId: string };
  [IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID]: {
    threadId: string;
    messageId: string;
  };

  // ドキュメントレビュー関連
  [IpcChannels.REVIEW_GET_HISTORIES]: undefined;
  [IpcChannels.REVIEW_GET_HISTORY_DETAIL]: string; // review history id
  [IpcChannels.REVIEW_DELETE_HISTORY]: string; // review history id
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]: {
    reviewHistoryId: string;
    sourceIds: number[];
    documentType?: DocumentType;
  };
  [IpcChannels.REVIEW_UPDATE_CHECKLIST]: {
    reviewHistoryId: string;
    checklistEdits: ReviewChecklistEdit[];
  };
  [IpcChannels.REVIEW_EXECUTE_CALL]: {
    reviewHistoryId: string;
    sourceIds: number[];
  };
};

export type IpcResponsePayloadMap = {
  // Mastra関連
  [IpcChannels.GET_SETTINGS_STATUS]: SettingsSavingStatus;
  [IpcChannels.REINITIALIZE_SETTINGS]: { success: boolean; error?: string };
  [IpcChannels.REMOVE_SETTINGS_MESSAGE]: { success: boolean; error?: string };

  // ファイルシステム関連
  [IpcChannels.FS_CHECK_PATH_EXISTS]: boolean;

  // ストア関連
  [IpcChannels.GET_STORE_VALUE]: unknown;
  [IpcChannels.SET_STORE_VALUE]: boolean;

  // ソース関連
  [IpcChannels.SOURCE_GET_ALL]: {
    success: boolean;
    sources?: Source[];
    error?: string;
  };
  [IpcChannels.SOURCE_RELOAD]: { success: boolean; message?: string };
  [IpcChannels.SOURCE_UPDATE_ENABLED]: { success: boolean; error?: string };

  // チャット関連
  [IpcChannels.CHAT_SEND_MESSAGE]: { success: boolean; error?: string };
  [IpcChannels.CHAT_GET_ROOMS]: ChatRoom[];
  [IpcChannels.CHAT_GET_MESSAGES]: ChatMessage[];
  [IpcChannels.CHAT_DELETE_ROOM]: { success: boolean; error?: string };
  [IpcChannels.CHAT_CREATE_THREAD]: { success: boolean; error?: string };
  [IpcChannels.CHAT_ABORT_REQUEST]: { success: boolean; error?: string };
  [IpcChannels.CHAT_DELETE_MESSAGES_BEFORE_SPECIFIC_ID]: {
    success: boolean;
    error?: string;
  };

  // ドキュメントレビュー関連
  [IpcChannels.REVIEW_GET_HISTORIES]: {
    success: boolean;
    histories?: ReviewHistory[];
    error?: string;
  };
  [IpcChannels.REVIEW_GET_HISTORY_DETAIL]: {
    success: boolean;
    checklistResults?: ReviewChecklistResult[];
    error?: string;
  };
  [IpcChannels.REVIEW_DELETE_HISTORY]: { success: boolean; error?: string };
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_CALL]: {
    success: boolean;
    error?: string;
  };
  [IpcChannels.REVIEW_UPDATE_CHECKLIST]: {
    success: boolean;
    error?: string;
  };
  [IpcChannels.REVIEW_EXECUTE_CALL]: {
    success: boolean;
    error?: string;
  };
};

export type IpcEventPayloadMap = {
  [IpcChannels.CHAT_STREAM]: any; // AI SDKが定義するDataStreamが入る想定(型がexportされていないためany型)
  [IpcChannels.CHAT_COMPLETE]: unknown;
  [IpcChannels.CHAT_ERROR]: { message: string };
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED]: {
    success: boolean;
    error?: string;
  };
  [IpcChannels.REVIEW_EXECUTE_FINISHED]: {
    success: boolean;
    error?: string;
  };
};

/**
 * 型安全性を確保するためのヘルパー型
 */
export type IpcRequestPayload<T extends keyof IpcRequestPayloadMap> =
  IpcRequestPayloadMap[T];

export type IpcResponsePayload<T extends keyof IpcResponsePayloadMap> =
  IpcResponsePayloadMap[T];

export type IpcEventPayload<T extends keyof IpcEventPayloadMap> =
  IpcEventPayloadMap[T];
