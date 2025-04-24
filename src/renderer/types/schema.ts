import { z } from 'zod';
import type { Source as DBSource, Topic as DBTopic } from '../../db/schema';
import type { ProcessStatus, ChatRole } from '../../shared/types/base';

/**
 * 共通のスキーマ定義
 */
export const baseEntityDateSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const processStatusSchema = z.enum([
  'idle',
  'processing',
  'completed',
  'failed',
]) satisfies z.ZodType<ProcessStatus>;

/**
 * DBのスキーマに基づいたZodバリデーションスキーマ
 */
export const SourceSchema = z.object({
  id: z.number(),
  path: z.string(),
  title: z.string(),
  summary: z.string(),
  status: processStatusSchema,
  error: z.string().nullable(),
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

/**
 * フロントエンド用の拡張スキーマ
 */
export const SourceWithTopicsSchema = SourceSchema.extend({
  topics: z.array(TopicSchema),
});

export const ChatRoomSchema = baseEntityDateSchema.extend({
  id: z.string(),
  title: z.string(),
});

export const ChatMessageSchema = baseEntityDateSchema.extend({
  id: z.string(),
  roomId: z.string(),
  role: z.enum(['user', 'assistant', 'system']) satisfies z.ZodType<ChatRole>,
  content: z.string(),
});

/**
 * 処理結果のスキーマ
 */
export const ProcessingResultSchema = z.object({
  filePath: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  timestamp: z.string(),
});

/**
 * 設定のスキーマ
 */
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

/**
 * 型エクスポート
 */
export type Source = z.infer<typeof SourceSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type SourceWithTopics = Source & { topics: Topic[] };
export type ChatRoom = z.infer<typeof ChatRoomSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;

/**
 * データベースの型とフロントエンドの型の変換ユーティリティ
 */
export const convertDBSourceToSource = (dbSource: DBSource): Source => ({
  id: dbSource.id,
  path: dbSource.path,
  title: dbSource.title,
  summary: dbSource.summary,
  createdAt: dbSource.createdAt,
  updatedAt: dbSource.updatedAt,
  status: dbSource.status,
  error: dbSource.error,
});

export const convertDBTopicToTopic = (dbTopic: DBTopic): Topic => ({
  id: dbTopic.id,
  sourceId: dbTopic.sourceId,
  name: dbTopic.name,
  summary: dbTopic.summary,
  createdAt: dbTopic.createdAt,
  updatedAt: dbTopic.updatedAt,
});
