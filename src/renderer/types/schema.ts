import { z } from 'zod';
import type { Source as DBSource, Topic as DBTopic } from '../../db/schema';

// DBのスキーマに基づいたZodスキーマ定義
export const SourceSchema = z.object({
  id: z.number(),
  path: z.string(),
  title: z.string(),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TopicSchema = z.object({
  id: z.number(),
  sourceId: z.number(),
  name: z.string(),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// フロントエンド用の拡張された型定義
export const SourceWithTopicsSchema = SourceSchema.extend({
  topics: z.array(TopicSchema),
});

// チャットルーム関連のスキーマ
export const ChatRoomSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.date(),
});

// 設定のスキーマ
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

// 型エクスポート
export type Source = z.infer<typeof SourceSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type SourceWithTopics = z.infer<typeof SourceWithTopicsSchema>;
export type ChatRoom = z.infer<typeof ChatRoomSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

// データベースの型とフロントエンドの型の変換ユーティリティ
export const convertDBSourceToSource = (dbSource: DBSource): Source => ({
  id: dbSource.id,
  path: dbSource.path,
  title: dbSource.title,
  summary: dbSource.summary,
  createdAt: dbSource.createdAt,
  updatedAt: dbSource.updatedAt,
});

export const convertDBTopicToTopic = (dbTopic: DBTopic): Topic => ({
  id: dbTopic.id,
  sourceId: dbTopic.sourceId,
  name: dbTopic.name,
  summary: dbTopic.summary,
  createdAt: dbTopic.createdAt,
  updatedAt: dbTopic.updatedAt,
});
