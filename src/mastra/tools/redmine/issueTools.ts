/**
 * Redmineチケット操作ツール
 * チケット一覧取得、詳細取得、作成、更新などの操作を提供
 */

import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { RedmineClient } from './redmineClient';
import { IssueFilter, RedmineIssue, RedmineIssueData } from './types';

/**
 * チケット一覧を取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns チケット一覧取得ツール
 */
export const createGetIssuesListTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-issues-list',
    description:
      'Redmineのチケット一覧を取得します。プロジェクト、ステータス、担当者などで絞り込み可能です。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('プロジェクトIDまたは名前'),
      status_id: z
        .union([z.string(), z.number(), z.enum(['open', 'closed', '*'])])
        .optional()
        .describe('ステータスIDまたは名前'),
      tracker_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('トラッカーIDまたは名前'),
      assigned_to_id: z
        .union([z.string(), z.number(), z.literal('me')])
        .optional()
        .describe('担当者IDまたは名前、"me"（自分）'),
      sprint_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('スプリントIDまたは名前'),
      fixed_version_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('バージョンIDまたは名前'),
      subject: z.string().optional().describe('タイトルに含まれる文字列'),
      sort: z
        .string()
        .optional()
        .describe('ソート条件（例: "priority:desc,updated_on:desc"）'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('取得上限数（最大100）'),
      offset: z.number().optional().default(0).describe('取得開始位置'),
    }),
    outputSchema: z.object({
      issues: z.array(
        z.object({
          id: z.number(),
          subject: z.string(),
          project: z.object({
            id: z.number(),
            name: z.string(),
          }),
          tracker: z.object({
            id: z.number(),
            name: z.string(),
          }),
          status: z.object({
            id: z.number(),
            name: z.string(),
          }),
          priority: z.object({
            id: z.number(),
            name: z.string(),
          }),
          assigned_to: z
            .object({
              id: z.number(),
              name: z.string(),
            })
            .optional(),
          author: z.object({
            id: z.number(),
            name: z.string(),
          }),
          description: z.string().optional(),
          start_date: z.string().optional(),
          due_date: z.string().optional(),
          done_ratio: z.number(),
          created_on: z.string(),
          updated_on: z.string(),
          story_points: z.number().optional(),
          sprint_id: z.number().optional(),
        }),
      ),
      total_count: z.number(),
    }),
    execute: async ({ context }) => {
      const filters: IssueFilter = {};
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
        if (context.assigned_to_id === 'me') {
          filters.assigned_to_id = 'me';
        } else if (
          typeof context.assigned_to_id === 'string' &&
          !Number.isNaN(Number(context.assigned_to_id))
        ) {
          filters.assigned_to_id = Number(context.assigned_to_id);
        } else if (typeof context.assigned_to_id === 'string') {
          const users = await client.getUsers();
          const userId = await client.resolveId(context.assigned_to_id, users);
          filters.assigned_to_id = userId;
        } else {
          filters.assigned_to_id = context.assigned_to_id;
        }
      }

      if (context.sprint_id) {
        if (
          typeof context.sprint_id === 'string' &&
          !Number.isNaN(Number(context.sprint_id))
        ) {
          filters.sprint_id = Number(context.sprint_id);
        } else if (
          typeof context.sprint_id === 'string' &&
          context.project_id
        ) {
          // スプリントIDはプロジェクトに依存するため、プロジェクトIDが必要
          let projectId = filters.project_id as number;
          if (!projectId && typeof context.project_id === 'string') {
            const projects = await client.getProjects();
            projectId = await client.resolveId(context.project_id, projects);
          }

          if (projectId) {
            const sprints = await client.getSprints(projectId);
            const sprintId = await client.resolveId(context.sprint_id, sprints);
            filters.sprint_id = sprintId;
          }
        } else {
          filters.sprint_id = context.sprint_id;
        }
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

      if (context.subject) {
        filters.subject = context.subject;
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
      queryParams.append('limit', String(limit));
      queryParams.append('offset', String(offset));

      // API リクエストの実行
      const path = `issues.json?${queryParams.toString()}`;
      const response = await client.request<{
        issues: RedmineIssue[];
        total_count: number;
        limit: number;
        offset: number;
      }>(path, 'GET');

      return {
        issues: response.issues,
        total_count: response.total_count,
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
      issue_id: z.number().describe('チケットID'),
      include: z
        .array(z.string())
        .optional()
        .default([])
        .describe(
          '含める関連情報（例: ["children", "attachments", "relations", "journals"]）',
        ),
    }),
    outputSchema: z.object({
      issue: z.object({
        id: z.number(),
        project: z.object({
          id: z.number(),
          name: z.string(),
        }),
        tracker: z.object({
          id: z.number(),
          name: z.string(),
        }),
        status: z.object({
          id: z.number(),
          name: z.string(),
        }),
        priority: z.object({
          id: z.number(),
          name: z.string(),
        }),
        author: z.object({
          id: z.number(),
          name: z.string(),
        }),
        assigned_to: z
          .object({
            id: z.number(),
            name: z.string(),
          })
          .optional(),
        subject: z.string(),
        description: z.string(),
        start_date: z.string().optional(),
        due_date: z.string().optional(),
        done_ratio: z.number(),
        created_on: z.string(),
        updated_on: z.string(),
        closed_on: z.string().optional(),
        custom_fields: z
          .array(
            z.object({
              id: z.number(),
              name: z.string(),
              value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
            }),
          )
          .optional(),
        fixed_version: z
          .object({
            id: z.number(),
            name: z.string(),
          })
          .optional(),
        parent: z
          .object({
            id: z.number(),
          })
          .optional(),
        children: z
          .array(
            z.object({
              id: z.number(),
              subject: z.string(),
            }),
          )
          .optional(),
        attachments: z
          .array(
            z.object({
              id: z.number(),
              filename: z.string(),
              filesize: z.number(),
              content_type: z.string(),
              author: z.object({
                id: z.number(),
                name: z.string(),
              }),
              created_on: z.string(),
            }),
          )
          .optional(),
        journals: z
          .array(
            z.object({
              id: z.number(),
              user: z.object({
                id: z.number(),
                name: z.string(),
              }),
              notes: z.string().optional(),
              created_on: z.string(),
              details: z
                .array(
                  z.object({
                    property: z.string(),
                    name: z.string().optional(),
                    old_value: z.union([z.string(), z.null()]).optional(),
                    new_value: z.union([z.string(), z.null()]).optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
        story_points: z.number().optional(),
        sprint_id: z.number().optional(),
        estimated_hours: z.number().optional(),
      }),
    }),
    execute: async ({ context }) => {
      // 含める関連情報の設定
      const includes = context.include?.join(',') || '';
      const path = `issues/${context.issue_id}.json${includes ? `?include=${includes}` : ''}`;

      // API リクエストの実行
      const response = await client.request<{ issue: RedmineIssue }>(
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
        .describe('プロジェクトIDまたは名前'),
      subject: z.string().describe('チケットのタイトル'),
      description: z.string().optional().describe('チケットの説明'),
      tracker_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('トラッカーIDまたは名前'),
      status_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('ステータスIDまたは名前'),
      priority_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('優先度IDまたは名前'),
      assigned_to_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('担当者IDまたは名前'),
      parent_issue_id: z.number().optional().describe('親チケットID'),
      fixed_version_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('バージョンIDまたは名前'),
      start_date: z.string().optional().describe('開始日（YYYY-MM-DD形式）'),
      due_date: z.string().optional().describe('期日（YYYY-MM-DD形式）'),
      estimated_hours: z.number().optional().describe('予定工数'),
      done_ratio: z.number().optional().describe('進捗率（0-100）'),
      custom_fields: z
        .array(
          z.object({
            id: z.number().describe('カスタムフィールドID'),
            value: z
              .union([z.string(), z.number(), z.boolean(), z.null()])
              .describe('値'),
          }),
        )
        .optional()
        .describe('カスタムフィールド'),
      sprint_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('スプリントIDまたは名前'),
      story_points: z.number().optional().describe('ストーリーポイント'),
    }),
    outputSchema: z.object({
      issue: z.object({
        id: z.number(),
        subject: z.string(),
        project: z.object({
          id: z.number(),
          name: z.string(),
        }),
      }),
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

      if (context.assigned_to_id) {
        if (
          typeof context.assigned_to_id === 'string' &&
          !Number.isNaN(Number(context.assigned_to_id))
        ) {
          issueData.assigned_to_id = Number(context.assigned_to_id);
        } else if (typeof context.assigned_to_id === 'string') {
          const users = await client.getUsers();
          issueData.assigned_to_id = await client.resolveId(
            context.assigned_to_id,
            users,
          );
        } else {
          issueData.assigned_to_id = context.assigned_to_id;
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

      if (context.done_ratio) {
        issueData.done_ratio = context.done_ratio;
      }

      if (context.custom_fields) {
        issueData.custom_fields = context.custom_fields;
      }

      if (context.sprint_id) {
        if (
          typeof context.sprint_id === 'string' &&
          !Number.isNaN(Number(context.sprint_id))
        ) {
          issueData.sprint_id = Number(context.sprint_id);
        } else if (typeof context.sprint_id === 'string') {
          const projectId =
            typeof issueData.project_id === 'number'
              ? issueData.project_id
              : await client.resolveId(
                  issueData.project_id,
                  await client.getProjects(),
                );

          const sprints = await client.getSprints(projectId);
          issueData.sprint_id = await client.resolveId(
            context.sprint_id,
            sprints,
          );
        } else {
          issueData.sprint_id = context.sprint_id;
        }
      }

      if (context.story_points) {
        issueData.story_points = context.story_points;
      }

      // API リクエストの実行
      const response = await client.request<{ issue: { id: number } }>(
        'issues.json',
        'POST',
        { issue: issueData },
      );

      // 作成されたチケットの詳細を取得
      const createdIssue = await client.request<{ issue: RedmineIssue }>(
        `issues/${response.issue.id}.json`,
        'GET',
      );

      return {
        issue: {
          id: createdIssue.issue.id,
          subject: createdIssue.issue.subject,
          project: createdIssue.issue.project,
        },
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
      issue_id: z.number().describe('更新するチケットのID'),
      notes: z.string().optional().describe('更新に関するコメント'),
      subject: z.string().optional().describe('チケットのタイトル'),
      description: z.string().optional().describe('チケットの説明'),
      tracker_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('トラッカーIDまたは名前'),
      status_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('ステータスIDまたは名前'),
      priority_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('優先度IDまたは名前'),
      assigned_to_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('担当者IDまたは名前'),
      parent_issue_id: z.number().optional().describe('親チケットID'),
      fixed_version_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('バージョンIDまたは名前'),
      start_date: z.string().optional().describe('開始日（YYYY-MM-DD形式）'),
      due_date: z.string().optional().describe('期日（YYYY-MM-DD形式）'),
      estimated_hours: z.number().optional().describe('予定工数'),
      done_ratio: z.number().optional().describe('進捗率（0-100）'),
      custom_fields: z
        .array(
          z.object({
            id: z.number().describe('カスタムフィールドID'),
            value: z
              .union([z.string(), z.number(), z.boolean(), z.null()])
              .describe('値'),
          }),
        )
        .optional()
        .describe('カスタムフィールド'),
      sprint_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('スプリントIDまたは名前'),
      story_points: z.number().optional().describe('ストーリーポイント'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      issue: z.object({
        id: z.number(),
        subject: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      // 既存チケットの詳細を取得
      const existingIssue = await client.request<{ issue: RedmineIssue }>(
        `issues/${context.issue_id}.json`,
        'GET',
      );

      // 更新データの準備
      const updateData: any = {};

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

      if (context.assigned_to_id) {
        if (
          typeof context.assigned_to_id === 'string' &&
          !Number.isNaN(Number(context.assigned_to_id))
        ) {
          updateData.assigned_to_id = Number(context.assigned_to_id);
        } else if (typeof context.assigned_to_id === 'string') {
          const users = await client.getUsers();
          updateData.assigned_to_id = await client.resolveId(
            context.assigned_to_id,
            users,
          );
        } else {
          updateData.assigned_to_id = context.assigned_to_id;
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

      if (context.done_ratio) {
        updateData.done_ratio = context.done_ratio;
      }

      if (context.custom_fields) {
        updateData.custom_fields = context.custom_fields;
      }

      if (context.sprint_id) {
        if (
          typeof context.sprint_id === 'string' &&
          !Number.isNaN(Number(context.sprint_id))
        ) {
          updateData.sprint_id = Number(context.sprint_id);
        } else if (typeof context.sprint_id === 'string') {
          const projectId = existingIssue.issue.project.id;
          const sprints = await client.getSprints(projectId);
          updateData.sprint_id = await client.resolveId(
            context.sprint_id,
            sprints,
          );
        } else {
          updateData.sprint_id = context.sprint_id;
        }
      }

      if (context.story_points) {
        updateData.story_points = context.story_points;
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
      const updatedIssue = await client.request<{ issue: RedmineIssue }>(
        `issues/${context.issue_id}.json`,
        'GET',
      );

      return {
        success: true,
        issue: {
          id: updatedIssue.issue.id,
          subject: updatedIssue.issue.subject,
        },
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
