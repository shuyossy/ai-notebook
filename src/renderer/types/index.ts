import { z } from 'zod';

// チャットルームの型定義
export interface ChatRoom {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

// チャットメッセージの型定義
export interface ChatMessage {
  id: string;
  roomId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

// ソース情報の型定義
export interface Source {
  id: number;
  title: string;
  summary: string;
  topics: {
    name: string;
    summary: string;
  }[];
}

// 設定の型定義
export const SettingsSchema = z.object({
  database: z.object({
    dir: z.string(),
  }),
  source: z.object({
    registerDir: z.string(),
  }),
  api: z.object({
    key: z.string(),
    url: z.string(),
    model: z.string(),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;
