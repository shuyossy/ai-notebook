// @ts-ignore
import type { AiMessageType, StorageThreadType } from '@mastra/core';

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
 * エージェントのツール状態を表す型
 */
export type AgentToolStatus = {
  document: boolean;
  redmine: boolean;
  gitlab: boolean;
  mcp: boolean;
};

