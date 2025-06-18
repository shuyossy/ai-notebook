import type { AiMessageType, StorageThreadType } from '@mastra/core';

/**
 * プロセス状態を表す型
 */
export type ProcessStatus = 'idle' | 'processing' | 'completed' | 'failed';

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

// Mastraの状態管理用の型定義
export type AgentBootState = 'initializing' | 'ready' | 'error';

export type AgentBootMessage = {
  id: string;
  type: 'info' | 'warning' | 'error';
  content: string;
};

/**
 * エージェントのツール状態を表す型
 */
export type AgentToolStatus = {
  document: boolean;
  redmine: boolean;
  gitlab: boolean;
  mcp: boolean;
  stagehand: boolean;
};

/**
 * エージェントのブート状態を表す型
 */
export type AgentBootStatus = {
  state: AgentBootState;
  messages?: AgentBootMessage[];
  tools?: AgentToolStatus;
};
