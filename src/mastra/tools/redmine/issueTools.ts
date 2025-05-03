/**
 * Redmineチケット操作ツール
 * チケット一覧取得、詳細取得、作成、更新などの操作を提供
 */

import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { RedmineClient } from './redmineClient';
import {
  IssueFilter,
  RedmineIssueData,
  RedmineUpdateIssueData,
  RedmineIssueListResponse,
  RedmineIssueDetailResponse,
  RedmineCreateIssueResponse,
} from './types';

/**
 * チケット一覧を取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns チケット一覧取得ツール
 */
export const createGetIssuesListTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-issues-list',
    description:
      'Redmineのチケット一覧を取得します。ステータス、トラッカー、担当者、バージョンで絞り込み可能です。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはプロジェクト名:必須'),
      status_id: z
        .union([z.string(), z.number(), z.enum(['open', 'closed', '*'])])
        .optional()
        .describe(
          '"open"または"closed"または"*"またはステータスIDまたは名前:任意',
        ),
      tracker_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('トラッカーIDまたはトラッカー名:任意'),
      assigned_to_id: z
        .union([z.number(), z.literal('me')])
        .optional()
        .describe('担当者ID、または"me"（自分）:任意'),
      fixed_version_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('バージョンIDまたはバージョン名:任意'),
      sort: z
        .string()
        .optional()
        .describe(
          'column to sort with. Append :desc to invert the order.（例: "category:desc,updated_on"）:任意',
        ),
    }),
    outputSchema: z.object({
      issues: z.any(),
    }),
    execute: async ({ context }) => {
      const filters: IssueFilter = {};

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

      if (context.status_id) {
        if (['open', 'closed', '*'].includes(context.status_id as string)) {
          filters.status_id = context.status_id as 'open' | 'closed' | '*';
        } else if (
          typeof context.status_id === 'string' &&
          !Number.isNaN(Number(context.status_id))
        ) {
          filters.status_id = Number(context.status_id);
        } else if (typeof context.status_id === 'string') {
          const statuses = await client.getStatuses();
          const statusId = await client.resolveId(context.status_id, statuses);
          filters.status_id = statusId;
        } else {
          filters.status_id = context.status_id;
        }
      }

      if (context.tracker_id) {
        if (
          typeof context.tracker_id === 'string' &&
          !Number.isNaN(Number(context.tracker_id))
        ) {
          filters.tracker_id = Number(context.tracker_id);
        } else if (typeof context.tracker_id === 'string') {
          const trackers = await client.getTrackers();
          const trackerId = await client.resolveId(
            context.tracker_id,
            trackers,
          );
          filters.tracker_id = trackerId;
        } else {
          filters.tracker_id = context.tracker_id;
        }
      }

      if (context.assigned_to_id) {
        filters.assigned_to_id = context.assigned_to_id;
      }

      if (context.fixed_version_id) {
        if (
          typeof context.fixed_version_id === 'string' &&
          !Number.isNaN(Number(context.fixed_version_id))
        ) {
          filters.fixed_version_id = Number(context.fixed_version_id);
        } else if (
          typeof context.fixed_version_id === 'string' &&
          context.project_id
        ) {
          // バージョンIDはプロジェクトに依存するため、プロジェクトIDが必要
          let projectId = filters.project_id as number;
          if (!projectId && typeof context.project_id === 'string') {
            const projects = await client.getProjects();
            projectId = await client.resolveId(context.project_id, projects);
          }

          if (projectId) {
            const versions = await client.getVersions(projectId);
            const versionId = await client.resolveId(
              context.fixed_version_id,
              versions,
            );
            filters.fixed_version_id = versionId;
          }
        } else {
          filters.fixed_version_id = context.fixed_version_id;
        }
      }

      if (context.sort) {
        filters.sort = context.sort;
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
      const limit = 100;
      let offset = 0;
      // すべてのチケットを格納する配列
      let all: any[] = [];
      // eslint-disable-next-line
      while (true) {
        // API リクエストの実行
        const path = `issues.json?${queryParams.toString()}&limit=${limit}&offset=${offset}`;
        // eslint-disable-next-line
        const response = await client.request<RedmineIssueListResponse>(
          path,
          'GET',
        );
        all = all.concat(response.issues);
        if (all.length >= response.total_count) break;
        offset += limit;
      }

      return {
        issues: all,
      };
    },
  });
};

/**
 * 特定のチケット詳細を取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns チケット詳細取得ツール
 */
export const createGetIssueDetailTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-issue-detail',
    description: 'Redmineの特定のチケット詳細を取得します。',
    inputSchema: z.object({
      issue_id: z.number().describe('チケットID:必須'),
      include: z
        .array(z.enum(['children', 'attachments', 'relations', 'journals']))
        .optional()
        .default([])
        .describe(
          '含める関連情報の配列（利用可能な関連情報: ["children", "attachments", "relations", "journals"]）:任意',
        ),
    }),
    outputSchema: z.object({
      issue: z.any(),
    }),
    execute: async ({ context }) => {
      // 含める関連情報の設定
      const includes = context.include?.join(',') || '';
      const path = `issues/${context.issue_id}.json${includes ? `?include=${includes}` : ''}`;

      // API リクエストの実行
      const response = await client.request<RedmineIssueDetailResponse>(
        path,
        'GET',
      );

      return {
        issue: response.issue,
      };
    },
  });
};

/**
 * チケットを作成するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns チケット作成ツール
 */
export const createCreateIssueTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-create-issue',
    description: 'Redmineに新しいチケットを作成します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはプロジェクト名:必須'),
      subject: z.string().describe('チケットのタイトル:必須'),
      description: z.string().optional().describe('チケットの説明:任意'),
      tracker_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('トラッカーIDまたはトラッカー名:任意'),
      status_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('ステータスIDまたはステータス名:任意'),
      priority_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('優先度IDまたは優先度名:任意'),
      parent_issue_id: z.number().optional().describe('親チケットID:任意'),
      fixed_version_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('バージョンIDまたはバージョン名:任意'),
      start_date: z
        .string()
        .optional()
        .describe('開始日（YYYY-MM-DD形式）:任意'),
      due_date: z.string().optional().describe('期日（YYYY-MM-DD形式）:任意'),
      estimated_hours: z.number().optional().describe('予定工数(h):任意'),
    }),
    outputSchema: z.object({
      created_issue: z.any(),
    }),
    execute: async ({ context }) => {
      // チケットデータの準備
      const issueData: RedmineIssueData = {
        project_id: context.project_id,
        subject: context.subject,
      };

      // 各種IDの名前からの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        issueData.project_id = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        issueData.project_id = await client.resolveId(
          context.project_id,
          projects,
        );
      }

      // オプションフィールドの設定
      if (context.description) {
        issueData.description = context.description;
      }

      if (context.tracker_id) {
        if (
          typeof context.tracker_id === 'string' &&
          !Number.isNaN(Number(context.tracker_id))
        ) {
          issueData.tracker_id = Number(context.tracker_id);
        } else if (typeof context.tracker_id === 'string') {
          const trackers = await client.getTrackers();
          issueData.tracker_id = await client.resolveId(
            context.tracker_id,
            trackers,
          );
        } else {
          issueData.tracker_id = context.tracker_id;
        }
      }

      if (context.status_id) {
        if (
          typeof context.status_id === 'string' &&
          !Number.isNaN(Number(context.status_id))
        ) {
          issueData.status_id = Number(context.status_id);
        } else if (typeof context.status_id === 'string') {
          const statuses = await client.getStatuses();
          issueData.status_id = await client.resolveId(
            context.status_id,
            statuses,
          );
        } else {
          issueData.status_id = context.status_id;
        }
      }

      if (context.priority_id) {
        if (
          typeof context.priority_id === 'string' &&
          !Number.isNaN(Number(context.priority_id))
        ) {
          issueData.priority_id = Number(context.priority_id);
        } else if (typeof context.priority_id === 'string') {
          const priorities = await client.getPriorities();
          issueData.priority_id = await client.resolveId(
            context.priority_id,
            priorities,
          );
        } else {
          issueData.priority_id = context.priority_id;
        }
      }

      if (context.parent_issue_id) {
        issueData.parent_issue_id = context.parent_issue_id;
      }

      if (context.fixed_version_id) {
        if (
          typeof context.fixed_version_id === 'string' &&
          !Number.isNaN(Number(context.fixed_version_id))
        ) {
          issueData.fixed_version_id = Number(context.fixed_version_id);
        } else if (typeof context.fixed_version_id === 'string') {
          const projectId =
            typeof issueData.project_id === 'number'
              ? issueData.project_id
              : await client.resolveId(
                  issueData.project_id,
                  await client.getProjects(),
                );

          const versions = await client.getVersions(projectId);
          issueData.fixed_version_id = await client.resolveId(
            context.fixed_version_id,
            versions,
          );
        } else {
          issueData.fixed_version_id = context.fixed_version_id;
        }
      }

      if (context.start_date) {
        issueData.start_date = context.start_date;
      }

      if (context.due_date) {
        issueData.due_date = context.due_date;
      }

      if (context.estimated_hours) {
        issueData.estimated_hours = context.estimated_hours;
      }

      // API リクエストの実行
      const response = await client.request<RedmineCreateIssueResponse>(
        'issues.json',
        'POST',
        { issue: issueData },
      );

      return {
        created_issue: response.issue,
      };
    },
  });
};

/**
 * チケットを更新するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns チケット更新ツール
 */
export const createUpdateIssueTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-update-issue',
    description: 'Redmineの既存チケットを更新します。',
    inputSchema: z.object({
      issue_id: z.number().describe('更新するチケットのID:必須'),
      notes: z.string().optional().describe('更新に関するコメント:任意'),
      subject: z.string().optional().describe('チケットのタイトル:任意'),
      description: z.string().optional().describe('チケットの説明:任意'),
      tracker_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('トラッカーIDまたはトラッカー名:任意'),
      status_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('ステータスIDまたはステータス名:任意'),
      priority_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('優先度IDまたは優先度名:任意'),
      assigned_to_id: z.number().optional().describe('担当者ID:任意'),
      parent_issue_id: z.number().optional().describe('親チケットID:任意'),
      fixed_version_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('バージョンIDまたはバージョン名:任意'),
      start_date: z
        .string()
        .optional()
        .describe('開始日（YYYY-MM-DD形式）:任意'),
      due_date: z.string().optional().describe('期日（YYYY-MM-DD形式）:任意'),
      estimated_hours: z.number().optional().describe('予定工数:任意'),
    }),
    outputSchema: z.object({
      updated_issue: z.any(),
    }),
    execute: async ({ context }) => {
      // 既存チケットの詳細を取得
      const existingIssue = await client.request<RedmineIssueDetailResponse>(
        `issues/${context.issue_id}.json`,
        'GET',
      );

      // 更新データの準備
      const updateData: RedmineUpdateIssueData = {};

      // 各フィールドの更新
      if (context.notes) {
        updateData.notes = context.notes;
      }

      if (context.subject) {
        updateData.subject = context.subject;
      }

      if (context.description) {
        updateData.description = context.description;
      }

      if (context.tracker_id) {
        if (
          typeof context.tracker_id === 'string' &&
          !Number.isNaN(Number(context.tracker_id))
        ) {
          updateData.tracker_id = Number(context.tracker_id);
        } else if (typeof context.tracker_id === 'string') {
          const trackers = await client.getTrackers();
          updateData.tracker_id = await client.resolveId(
            context.tracker_id,
            trackers,
          );
        } else {
          updateData.tracker_id = context.tracker_id;
        }
      }

      if (context.status_id) {
        if (
          typeof context.status_id === 'string' &&
          !Number.isNaN(Number(context.status_id))
        ) {
          updateData.status_id = Number(context.status_id);
        } else if (typeof context.status_id === 'string') {
          const statuses = await client.getStatuses();
          updateData.status_id = await client.resolveId(
            context.status_id,
            statuses,
          );
        } else {
          updateData.status_id = context.status_id;
        }
      }

      if (context.priority_id) {
        if (
          typeof context.priority_id === 'string' &&
          !Number.isNaN(Number(context.priority_id))
        ) {
          updateData.priority_id = Number(context.priority_id);
        } else if (typeof context.priority_id === 'string') {
          const priorities = await client.getPriorities();
          updateData.priority_id = await client.resolveId(
            context.priority_id,
            priorities,
          );
        } else {
          updateData.priority_id = context.priority_id;
        }
      }

      if (context.parent_issue_id) {
        updateData.parent_issue_id = context.parent_issue_id;
      }

      if (context.fixed_version_id) {
        if (
          typeof context.fixed_version_id === 'string' &&
          !Number.isNaN(Number(context.fixed_version_id))
        ) {
          updateData.fixed_version_id = Number(context.fixed_version_id);
        } else if (typeof context.fixed_version_id === 'string') {
          const projectId = existingIssue.issue.project.id;
          const versions = await client.getVersions(projectId);
          updateData.fixed_version_id = await client.resolveId(
            context.fixed_version_id,
            versions,
          );
        } else {
          updateData.fixed_version_id = context.fixed_version_id;
        }
      }

      if (context.start_date) {
        updateData.start_date = context.start_date;
      }

      if (context.due_date) {
        updateData.due_date = context.due_date;
      }

      if (context.estimated_hours) {
        updateData.estimated_hours = context.estimated_hours;
      }

      // 更新内容があるか確認
      if (Object.keys(updateData).length === 0) {
        throw new Error('更新する項目が指定されていません');
      }

      // API リクエストの実行
      await client.request(`issues/${context.issue_id}.json`, 'PUT', {
        issue: updateData,
      });

      // 更新後のチケット詳細を取得
      const updatedIssue = await client.request<RedmineIssueDetailResponse>(
        `issues/${context.issue_id}.json`,
        'GET',
      );

      return {
        updated_issue: updatedIssue.issue,
      };
    },
  });
};

/**
 * Redmineのチケット操作ツール一式を作成する
 * @param client RedmineClient - Redmine APIクライアント
 * @returns チケット操作ツール一式
 */
export const createIssueTools = (client: RedmineClient) => {
  return {
    getIssuesList: createGetIssuesListTool(client),
    getIssueDetail: createGetIssueDetailTool(client),
    createIssue: createCreateIssueTool(client),
    updateIssue: createUpdateIssueTool(client),
  };
};
