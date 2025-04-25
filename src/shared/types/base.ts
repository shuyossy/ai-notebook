import type { AiMessageType, StorageThreadType } from '@mastra/core';

/**
 * 日付を含む基本エンティティの型
 */
export type BaseEntityDate = {
  createdAt: string; // ISO 8601形式の文字列
  updatedAt: string;
};

/**
 * プロセス状態を表す型
 */
export type ProcessStatus = 'idle' | 'processing' | 'completed' | 'failed';

/**
 * 基本的なエラーの型定義
 */
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * IPC通信のエラー型
 */
export class IPCError extends Error implements AppError {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'IPCError';
  }
}

/**
 * 処理結果の型
 */
export interface ProcessResult {
  success: boolean;
  message?: string;
  error?: IPCError;
}

/**
 * チャットのロール型
 */
export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * チャットルーム情報の型（Mastraの型を利用）
 */
export type ChatRoom = StorageThreadType;

/**
 * チャットメッセージの型（Mastraの型を利用）
 */
export type ChatMessage = AiMessageType;

/**
 * ストリーミングメッセージの型
 */
export interface StreamMessage {
  content?: string;
}
