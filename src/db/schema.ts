import {
  integer,
  sqliteTable,
  text,
  customType,
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

// ソースとトピックの関係性を定義
export type Source = typeof sources.$inferSelect;
export type InsertSource = typeof sources.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;
