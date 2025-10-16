import {
  integer,
  sqliteTable,
  text,
  customType,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { ProcessStatus } from '@/types';

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
  targetDocumentName: text('target_document_name'), // レビュー対象の統合ドキュメント名
  additionalInstructions: text('additional_instructions'), // レビューの追加指示
  commentFormat: text('comment_format'), // レビューのコメントフォーマット
  evaluationSettings: text('evaluation_settings'), // 評定項目設定（JSON形式）
  documentMode: text('document_mode'), // レビュー実行方法: small, large
  processingStatus: text('processing_status').notNull().default('idle'), // 処理ステータス: idle, extracting, extracted, reviewing, completed
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
  evaluation: text('evaluation'), // A, B, C, - 評価
  comment: text('comment'), // レビューコメント
  createdBy: text('created_by').notNull(), // 'user' or 'system'
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => sql`(current_timestamp)`),
});

// レビュードキュメントキャッシュを格納するテーブル
export const reviewDocumentCaches = sqliteTable('review_document_caches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reviewHistoryId: text('review_history_id')
    .notNull()
    .references(() => reviewHistories.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(), // ワークフロー内での名前（分割時は "xxx (part 1)" など）
  processMode: text('process_mode').notNull(), // 'text' or 'image'
  cachePath: text('cache_path').notNull(), // ファイル/ディレクトリパス
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => sql`(current_timestamp)`),
});

// レビュー大量ドキュメント結果キャッシュを格納するテーブル（大量ドキュメントレビューの個別レビュー結果）
export const reviewLargedocumentResultCaches = sqliteTable(
  'review_largedocument_result_caches',
  {
    reviewDocumentCacheId: integer('review_document_cache_id')
      .notNull()
      .references(() => reviewDocumentCaches.id, { onDelete: 'cascade' }),
    reviewChecklistId: integer('review_checklist_id')
      .notNull()
      .references(() => reviewChecklists.id, { onDelete: 'cascade' }),
    comment: text('comment').notNull(), // 個別レビューコメント
    totalChunks: integer('total_chunks').notNull(), // ドキュメント分割総数
    chunkIndex: integer('chunk_index').notNull(), // 何番目のチャンクか（0から始まる）
    individualFileName: text('individual_file_name').notNull(), // 分割後の個別ドキュメント名（"xxx (part 1)" など）
  },
  (table) => ({
    pk: primaryKey({
      columns: [
        table.reviewDocumentCacheId,
        table.reviewChecklistId,
        table.chunkIndex,
      ],
    }),
  }),
);

// 型定義
export type SourceEntity = typeof sources.$inferSelect;
export type InsertSourceEntity = typeof sources.$inferInsert;
export type TopicEntity = typeof topics.$inferSelect;
export type InsertTopicEntity = typeof topics.$inferInsert;
export type ReviewHistoryEntity = typeof reviewHistories.$inferSelect;
export type InsertReviewHistoryEntity = typeof reviewHistories.$inferInsert;
export type ReviewChecklistEntity = typeof reviewChecklists.$inferSelect;
export type InsertReviewChecklistEntity = typeof reviewChecklists.$inferInsert;
export type ReviewDocumentCacheEntity =
  typeof reviewDocumentCaches.$inferSelect;
export type InsertReviewDocumentCacheEntity =
  typeof reviewDocumentCaches.$inferInsert;
export type ReviewLargedocumentResultCacheEntity =
  typeof reviewLargedocumentResultCaches.$inferSelect;
export type InsertReviewLargedocumentResultCacheEntity =
  typeof reviewLargedocumentResultCaches.$inferInsert;
