import type { ChatMessage, ChatRoom, AgentBootStatus } from '.';
import type { Source } from '../../db/schema';

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

  // ファイルシステム関連
  FS_CHECK_PATH_EXISTS: 'fs-check-path-exists',
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
};

export type IpcEventPayloadMap = {
  [IpcChannels.CHAT_STREAM]: any; // AI SDKが定義するDataStreamが入る想定(型がexportされていないためany型)
  [IpcChannels.CHAT_COMPLETE]: unknown;
  [IpcChannels.CHAT_ERROR]: { message: string };
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
