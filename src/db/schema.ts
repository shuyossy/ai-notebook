import {
  integer,
  sqliteTable,
  text,
  customType,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { ProcessStatus } from '../main/types';

/**
 * SQLiteのカスタム型定義
 */
const sourceStatusType = customType<{ data: ProcessStatus }>({
  dataType() {
    return 'text';
  },
});

// ソース情報を格納するテーブル
export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => sql`(current_timestamp)`),
  status: sourceStatusType('status').notNull().default('idle'),
  error: text('error'),
  isEnabled: integer('is_enabled').notNull().default(1),
});

// トピックを格納するテーブル
export const topics = sqliteTable('topics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceId: integer('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => sql`(current_timestamp)`),
});

// レビュー履歴を格納するテーブル
export const reviewHistories = sqliteTable('review_histories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(), // ソースのtitleを/区切りで結合
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => sql`(current_timestamp)`),
});

// レビューチェックリストを格納するテーブル
export const reviewChecklists = sqliteTable('review_checklists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reviewHistoryId: integer('review_history_id')
    .notNull()
    .references(() => reviewHistories.id, { onDelete: 'cascade' }),
  content: text('content').notNull(), // チェックリスト項目
  evaluation: text('evaluation'), // A, B, C評価
  comment: text('comment'), // レビューコメント
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => sql`(current_timestamp)`),
});

// レビュー履歴とソースの中間テーブル
export const reviewHistorySources = sqliteTable(
  'review_history_sources',
  {
    reviewHistoryId: integer('review_history_id')
      .notNull()
      .references(() => reviewHistories.id, { onDelete: 'cascade' }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [primaryKey({ columns: [t.reviewHistoryId, t.sourceId] })],
);

// 型定義
export type Source = typeof sources.$inferSelect;
export type InsertSource = typeof sources.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;
export type ReviewHistory = typeof reviewHistories.$inferSelect;
export type InsertReviewHistory = typeof reviewHistories.$inferInsert;
export type ReviewChecklist = typeof reviewChecklists.$inferSelect;
export type InsertReviewChecklist = typeof reviewChecklists.$inferInsert;
export type ReviewHistorySource = typeof reviewHistorySources.$inferSelect;
export type InsertReviewHistorySource =
  typeof reviewHistorySources.$inferInsert;
