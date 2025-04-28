/**
 * Redmineタイムエントリー操作ツール
 * タイムエントリーの一覧取得、作成、更新などの操作を提供
 */

import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { RedmineClient } from './redmineClient';
import {
  RedmineTimeEntry,
  RedmineTimeEntryData,
  TimeEntryFilter,
} from './types';

/**
 * タイムエントリー一覧を取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns タイムエントリー一覧取得ツール
 */
export const createGetTimeEntriesListTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-time-entries-list',
    description:
      'Redmineのタイムエントリー（時間記録）一覧を取得します。プロジェクト、ユーザー、日付などで絞り込み可能です。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('プロジェクトIDまたは名前'),
      issue_id: z.number().optional().describe('チケットID'),
      user_id: z
        .union([z.string(), z.number(), z.literal('me')])
        .optional()
        .describe('ユーザーIDまたは名前、"me"（自分）'),
      spent_on: z
        .string()
        .optional()
        .describe(
          '日付（YYYY-MM-DD形式）または範囲（><YYYY-MM-DD|YYYY-MM-DD形式）',
        ),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('取得上限数（最大100）'),
      offset: z.number().optional().default(0).describe('取得開始位置'),
    }),
    outputSchema: z.object({
      time_entries: z.array(
        z.object({
          id: z.number(),
          project: z.object({
            id: z.number(),
            name: z.string(),
          }),
          issue: z
            .object({
              id: z.number(),
            })
            .optional(),
          user: z.object({
            id: z.number(),
            name: z.string(),
          }),
          activity: z.object({
            id: z.number(),
            name: z.string(),
          }),
          hours: z.number(),
          comments: z.string().optional(),
          spent_on: z.string(),
          created_on: z.string(),
          updated_on: z.string(),
        }),
      ),
      total_count: z.number(),
    }),
    execute: async ({ context }) => {
      const filters: TimeEntryFilter = {};
      const limit = context.limit || 100;
      const offset = context.offset || 0;

      // フィルター条件の設定
      if (context.project_id) {
        if (
          typeof context.project_id === 'string' &&
          !Number.isNaN(Number(context.project_id))
        ) {
          filters.project_id = Number(context.project_id);
        } else if (typeof context.project_id === 'string') {
          const projects = await client.getProjects();
          const projectId = await client.resolveId(
            context.project_id,
            projects,
          );
          filters.project_id = projectId;
        } else {
          filters.project_id = context.project_id;
        }
      }

      if (context.issue_id) {
        filters.issue_id = context.issue_id;
      }

      if (context.user_id) {
        if (context.user_id === 'me') {
          filters.user_id = 'me';
        } else if (
          typeof context.user_id === 'string' &&
          !Number.isNaN(Number(context.user_id))
        ) {
          filters.user_id = Number(context.user_id);
        } else if (typeof context.user_id === 'string') {
          const users = await client.getUsers();
          const userId = await client.resolveId(context.user_id, users);
          filters.user_id = userId;
        } else {
          filters.user_id = context.user_id;
        }
      }

      if (context.spent_on) {
        filters.spent_on = context.spent_on;
      }

      // URL クエリパラメータの構築
      const queryParams = new URLSearchParams();

      // フィルター条件をクエリパラメータに追加
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });

      // ページネーション
      queryParams.append('limit', String(limit));
      queryParams.append('offset', String(offset));

      // API リクエストの実行
      const path = `time_entries.json?${queryParams.toString()}`;
      const response = await client.request<{
        time_entries: RedmineTimeEntry[];
        total_count: number;
        limit: number;
        offset: number;
      }>(path);

      return {
        time_entries: response.time_entries,
        total_count: response.total_count,
      };
    },
  });
};

/**
 * タイムエントリーを作成するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns タイムエントリー作成ツール
 */
export const createCreateTimeEntryTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-create-time-entry',
    description: 'Redmineに新しいタイムエントリー（時間記録）を作成します。',
    inputSchema: z.object({
      issue_id: z
        .number()
        .optional()
        .describe('チケットID（issue_idまたはproject_idのいずれかが必要）'),
      project_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe(
          'プロジェクトIDまたは名前（issue_idまたはproject_idのいずれかが必要）',
        ),
      spent_on: z.string().describe('作業日（YYYY-MM-DD形式）'),
      hours: z.number().describe('作業時間（時間単位）'),
      activity_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('作業分類IDまたは名前'),
      comments: z.string().optional().describe('コメント'),
      user_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('ユーザーIDまたは名前（管理者のみ指定可能）'),
    }),
    outputSchema: z.object({
      time_entry: z.object({
        id: z.number(),
        project: z.object({
          id: z.number(),
          name: z.string(),
        }),
        issue: z
          .object({
            id: z.number(),
          })
          .optional(),
        hours: z.number(),
        spent_on: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      // タイムエントリーデータの準備
      const timeEntryData: RedmineTimeEntryData = {
        spent_on: context.spent_on,
        hours: context.hours,
      };

      // issue_idかproject_idのいずれかが必要
      if (context.issue_id) {
        timeEntryData.issue_id = context.issue_id;
      } else if (context.project_id) {
        if (
          typeof context.project_id === 'string' &&
          !Number.isNaN(Number(context.project_id))
        ) {
          timeEntryData.project_id = Number(context.project_id);
        } else if (typeof context.project_id === 'string') {
          const projects = await client.getProjects();
          timeEntryData.project_id = await client.resolveId(
            context.project_id,
            projects,
          );
        } else {
          timeEntryData.project_id = context.project_id;
        }
      } else {
        throw new Error('issue_idまたはproject_idのいずれかを指定してください');
      }

      // オプションフィールドの設定
      if (context.activity_id) {
        if (
          typeof context.activity_id === 'string' &&
          !Number.isNaN(Number(context.activity_id))
        ) {
          timeEntryData.activity_id = Number(context.activity_id);
        } else if (typeof context.activity_id === 'string') {
          // 作業分類（activity）の名前からIDへの解決は、Redmine APIで直接サポートされておらず、
          // 通常は/enumerations/time_entry_activities.jsonから取得する必要があります。
          // ここでは簡易的にクライアントが解決できると仮定しています。
          timeEntryData.activity_id = context.activity_id;
        } else {
          timeEntryData.activity_id = context.activity_id;
        }
      }

      if (context.comments) {
        timeEntryData.comments = context.comments;
      }

      if (context.user_id) {
        if (
          typeof context.user_id === 'string' &&
          !Number.isNaN(Number(context.user_id))
        ) {
          timeEntryData.user_id = Number(context.user_id);
        } else if (typeof context.user_id === 'string') {
          const users = await client.getUsers();
          timeEntryData.user_id = await client.resolveId(
            context.user_id,
            users,
          );
        } else {
          timeEntryData.user_id = context.user_id;
        }
      }

      // API リクエストの実行
      const response = await client.request<{ time_entry: RedmineTimeEntry }>(
        'time_entries.json',
        'POST',
        { time_entry: timeEntryData },
      );

      return {
        time_entry: {
          id: response.time_entry.id,
          project: response.time_entry.project,
          issue: response.time_entry.issue,
          hours: response.time_entry.hours,
          spent_on: response.time_entry.spent_on,
        },
      };
    },
  });
};

/**
 * Redmineのタイムエントリー操作ツール一式を作成する
 * @param client RedmineClient - Redmine APIクライアント
 * @returns タイムエントリー操作ツール一式
 */
export const createTimeEntryTools = (client: RedmineClient) => {
  return {
    getTimeEntriesList: createGetTimeEntriesListTool(client),
    createTimeEntry: createCreateTimeEntryTool(client),
  };
};
