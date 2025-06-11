import type {
  ChatMessage,
  ChatRoom,
  AgentBootStatus,
  ReviewChecklistResult,
  ReviewChecklistEdit,
} from '.';
import type { Source, ReviewHistory, ReviewChecklist } from '../../db/schema';

/**
 * IPC通信で使用するチャネル名の定義
 */
export const IpcChannels = {
  // Agent関連
  GET_AGENT_STATUS: 'get-agent-status',
  AGENT_STATUS_CHANGED: 'agent-status-changed',
  REINITIALIZE_AGENT: 'reinitialize-agent',
  REMOVE_AGENT_MESSAGE: 'remove-agent-message',

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
  CHAT_EDIT_HISTORY: 'chat-edit-history',

  // ファイルシステム関連
  FS_CHECK_PATH_EXISTS: 'fs-check-path-exists',

  // ドキュメントレビュー関連
  REVIEW_GET_HISTORIES: 'review-get-histories', // ドキュメント履歴切り替え時やチェックリスト抽出・ドキュメントレビュー時のポーリング処理にて呼び出される
  REVIEW_GET_HISTORY_CHECKLIST: 'review-get-history-detail',
  REVIEW_DELETE_HISTORY: 'review-delete-history',
  REVIEW_EXTRACT_CHECKLIST: 'review-extract-checklist',
  REVIEW_EXTRACT_CHECKLIST_PART_FINISHED: 'review-extract-checklist-part-finished', // チェックリスト抽出の一部が完了した際に発火され、最終的に画面上の一部のチェックリストが更新される
  REVIEW_UPDATE_CHECKLIST: 'review-update-checklist',
  REVIEW_EXECUTE: 'review-execute',
  REVIEW_EXECUTE_PART_FINISHED: 'review-execute-part-finished', // レビュー実行の一部が完了した際に発火され、最終的に画面上の一部のレビュー結果が更新される
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/**
 * IPC通信のペイロード型マッピング
 * 各チャネルごとにリクエストとレスポンスの型を厳密に定義
 */
export type IpcRequestPayloadMap = {
  // Mastra関連
  [IpcChannels.REINITIALIZE_AGENT]: undefined;
  [IpcChannels.REMOVE_AGENT_MESSAGE]: string; // message id

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
  [IpcChannels.CHAT_SEND_MESSAGE]: { roomId: string; content: string };
  [IpcChannels.CHAT_GET_ROOMS]: undefined;
  [IpcChannels.CHAT_GET_MESSAGES]: string; // threadId
  [IpcChannels.CHAT_DELETE_ROOM]: string; // threadId
  [IpcChannels.CHAT_CREATE_THREAD]: {
    roomId: string;
    title: string;
  };
  [IpcChannels.CHAT_ABORT_REQUEST]: { threadId: string };
  [IpcChannels.CHAT_EDIT_HISTORY]: {
    threadId: string;
    oldContent: string;
    oldCreatedAt: Date;
  };

  // ドキュメントレビュー関連
  [IpcChannels.REVIEW_GET_HISTORIES]: undefined;
  [IpcChannels.REVIEW_GET_HISTORY_CHECKLIST]: number; // review history id
  [IpcChannels.REVIEW_DELETE_HISTORY]: number; // review history id
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST]: {
    reviewHistoryId?: number; // 指定がない場合は新規作成
    sourceIds: number[];
  };
  [IpcChannels.REVIEW_UPDATE_CHECKLIST]: {
    reviewHistoryId: number;
    checklists: ReviewChecklistEdit[];
  };
  [IpcChannels.REVIEW_EXECUTE]: {
    reviewHistoryId: number;
    sourceIds: number[];
  };
};

export type IpcResponsePayloadMap = {
  // Mastra関連
  [IpcChannels.GET_AGENT_STATUS]: AgentBootStatus;
  [IpcChannels.REINITIALIZE_AGENT]: { success: boolean; error?: string };
  [IpcChannels.REMOVE_AGENT_MESSAGE]: { success: boolean; error?: string };

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
  [IpcChannels.CHAT_EDIT_HISTORY]: { success: boolean; error?: string };

  // ドキュメントレビュー関連
  [IpcChannels.REVIEW_GET_HISTORIES]: {
    success: boolean;
    histories?: ReviewHistory[];
    error?: string;
  };
  [IpcChannels.REVIEW_GET_HISTORY_CHECKLIST]: {
    success: boolean;
    checklistResults?: ReviewChecklistResult[];
    error?: string;
  };
  [IpcChannels.REVIEW_DELETE_HISTORY]: { success: boolean; error?: string };
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST]: { success: boolean; error?: string };
  [IpcChannels.REVIEW_UPDATE_CHECKLIST]: {
    success: boolean;
    error?: string;
  };
  [IpcChannels.REVIEW_EXECUTE]: {
    success: boolean;
    error?: string;
  };
};

export type IpcEventPayloadMap = {
  [IpcChannels.CHAT_STREAM]: any; // AI SDKが定義するDataStreamが入る想定(型がexportされていないためany型)
  [IpcChannels.CHAT_COMPLETE]: unknown;
  [IpcChannels.CHAT_ERROR]: { message: string };
  [IpcChannels.REVIEW_EXTRACT_CHECKLIST_PART_FINISHED]: {
    reviewHistoryId: number;
    checklists?: ReviewChecklist[];
    allFinished: boolean; // 全てのチェックリストが抽出されたかどうか
  }
  [IpcChannels.REVIEW_EXECUTE_PART_FINISHED]: {
    reviewHistoryId: number;
    checklistResults?: ReviewChecklistResult[];
    allFinished: boolean; // 全てのチェックリストがレビューされたかどうか
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
