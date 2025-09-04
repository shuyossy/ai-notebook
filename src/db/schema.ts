import {
  integer,
  sqliteTable,
  text,
  customType,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
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
  id: text('id')
    .primaryKey()
    .$default(() => uuidv4()), // 汎用チャット機能のコードを活用できるように、MastraのThreadと同じく主キーは文字列とする
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
  reviewHistoryId: text('review_history_id')
    .notNull()
    .references(() => reviewHistories.id, { onDelete: 'cascade' }),
  content: text('content').notNull(), // チェックリスト項目
  createdBy: text('created_by').notNull(), // 'user' or 'system'
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => sql`(current_timestamp)`),
});

// レビューチェックリスト結果テーブル（1つのチェックリストに対して複数のファイル結果を保存）
export const reviewChecklistResults = sqliteTable(
  'review_checklist_results',
  {
    reviewChecklistId: integer('review_checklist_id')
      .notNull()
      .references(() => reviewChecklists.id, { onDelete: 'cascade' }),
    fileId: text('file_id').notNull(), // アップロードファイルのID
    fileName: text('file_name').notNull(), // ファイル名
    evaluation: text('evaluation').notNull(), // A, B, C, - 評価
    comment: text('comment'), // レビューコメント
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`)
      .$onUpdate(() => sql`(current_timestamp)`),
  },
  (t) => [primaryKey({ columns: [t.reviewChecklistId, t.fileId] })],
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
export type ReviewChecklistResult = typeof reviewChecklistResults.$inferSelect;
export type InsertReviewChecklistResult =
  typeof reviewChecklistResults.$inferInsert;
