import type {
  ChatMessage,
  ProcessResult,
  AppError,
  StreamMessage,
} from './base';
import type { Source } from '../../db/schema';

/**
 * IPC通信で使用するチャネル名の定義
 */
export const IpcChannels = {
  // ソース関連
  GET_SOURCES: 'get-sources',
  RELOAD_SOURCES: 'reload-sources',
  REGISTER_SOURCE: 'register-source',
  DELETE_SOURCE: 'delete-source',

  // チャット関連
  SEND_CHAT_MESSAGE: 'send-chat-message',
  RECEIVE_CHAT_MESSAGE: 'receive-chat-message',
  CHAT_STREAM_START: 'chat-stream-start',
  CHAT_STREAM_CHUNK: 'chat-stream-chunk',
  CHAT_STREAM_END: 'chat-stream-end',
  CHAT_STREAM_ERROR: 'chat-stream-error',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/**
 * IPC通信の基本型定義
 */
interface IpcRequestBase {
  channel: IpcChannel;
}

interface IpcResponseBase {
  success: boolean;
  error?: AppError;
}

/**
 * ソース関連の型定義
 */
export interface RegisterSourceRequest extends IpcRequestBase {
  path: string;
  type: 'file' | 'directory';
}

/**
 * チャット関連の型定義
 */
export interface SendChatMessageRequest extends IpcRequestBase {
  roomId: string;
  content: string;
}

/**
 * IPC通信のレスポンス型
 */
export type IpcResponse<T> = IpcResponseBase & {
  data?: T;
};

/**
 * IPC通信のペイロード型マッピング
 * 各チャネルごとにリクエストとレスポンスの型を厳密に定義
 */
export type IpcRequestPayloadMap = {
  [IpcChannels.GET_SOURCES]: undefined;
  [IpcChannels.RELOAD_SOURCES]: undefined;
  [IpcChannels.REGISTER_SOURCE]: RegisterSourceRequest;
  [IpcChannels.DELETE_SOURCE]: { id: number };
  [IpcChannels.SEND_CHAT_MESSAGE]: SendChatMessageRequest;
  [IpcChannels.CHAT_STREAM_START]: SendChatMessageRequest;
};

export type IpcResponsePayloadMap = {
  [IpcChannels.GET_SOURCES]: Source[];
  [IpcChannels.RELOAD_SOURCES]: ProcessResult;
  [IpcChannels.REGISTER_SOURCE]: ProcessResult;
  [IpcChannels.DELETE_SOURCE]: ProcessResult;
  [IpcChannels.SEND_CHAT_MESSAGE]: ChatMessage;
  [IpcChannels.CHAT_STREAM_START]: { messageId: string };
};

/**
 * 型安全性を確保するためのヘルパー型
 */
export type IpcRequestPayload<T extends keyof IpcRequestPayloadMap> =
  IpcRequestPayloadMap[T];

export type IpcResponsePayload<T extends keyof IpcResponsePayloadMap> =
  IpcResponsePayloadMap[T];

export interface IpcEventPayloadMap {
  [IpcChannels.RECEIVE_CHAT_MESSAGE]: ChatMessage;
  [IpcChannels.CHAT_STREAM_CHUNK]: StreamMessage;
  [IpcChannels.CHAT_STREAM_END]: StreamMessage;
  [IpcChannels.CHAT_STREAM_ERROR]: StreamMessage;
}
