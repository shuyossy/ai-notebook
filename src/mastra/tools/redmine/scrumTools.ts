/**
 * Redmine Scrumプラグイン操作ツール
 * スプリント、バックログ、バーンダウンチャートなどの機能を提供
 */

import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { RedmineClient } from './redmineClient';
import { RedmineSprint, RedmineSprintData, RedmineBurndownData } from './types';

/**
 * プロジェクトのスプリント一覧を取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns スプリント一覧取得ツール
 */
export const createGetSprintsListTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-sprints-list',
    description: 'Redmineプロジェクトのスプリント一覧を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
    }),
    outputSchema: z.object({
      sprints: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          status: z.number(),
          project_id: z.number(),
          sprint_start_date: z.string().optional(),
          sprint_end_date: z.string().optional(),
          is_product_backlog: z.boolean(),
          shared: z.boolean().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      let projectId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // API リクエストの実行
      const path = `projects/${projectId}/sprints.json`;
      const response = await client.request<{
        sprints: RedmineSprint[];
      }>(path);

      return {
        sprints: response.sprints,
      };
    },
  });
};

/**
 * スプリント詳細を取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns スプリント詳細取得ツール
 */
export const createGetSprintDetailTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-sprint-detail',
    description: 'Redmineの特定のスプリント詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      sprint_id: z
        .union([z.string(), z.number()])
        .describe('スプリントIDまたは名前'),
    }),
    outputSchema: z.object({
      sprint: z.object({
        id: z.number(),
        name: z.string(),
        status: z.number(),
        project_id: z.number(),
        sprint_start_date: z.string().optional(),
        sprint_end_date: z.string().optional(),
        is_product_backlog: z.boolean(),
        shared: z.boolean().optional(),
        issues: z
          .array(
            z.object({
              id: z.number(),
              subject: z.string(),
              tracker: z.object({
                id: z.number(),
                name: z.string(),
              }),
              status: z.object({
                id: z.number(),
                name: z.string(),
              }),
              story_points: z.number().optional(),
              assigned_to: z
                .object({
                  id: z.number(),
                  name: z.string(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;
      let sprintId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // スプリントIDの解決
      if (
        typeof context.sprint_id === 'string' &&
        !Number.isNaN(Number(context.sprint_id))
      ) {
        sprintId = Number(context.sprint_id);
      } else if (typeof context.sprint_id === 'string') {
        const sprints = await client.getSprints(projectId);
        sprintId = await client.resolveId(context.sprint_id, sprints);
      } else {
        sprintId = context.sprint_id as number;
      }

      // API リクエストの実行
      const path = `projects/${projectId}/sprints/${sprintId}.json`;
      const response = await client.request<{
        sprint: RedmineSprint & {
          issues?: {
            id: number;
            subject: string;
            tracker: {
              id: number;
              name: string;
            };
            status: {
              id: number;
              name: string;
            };
            story_points?: number;
            assigned_to?: {
              id: number;
              name: string;
            };
          }[];
        };
      }>(path);

      return {
        sprint: response.sprint,
      };
    },
  });
};

/**
 * スプリントを作成するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns スプリント作成ツール
 */
export const createCreateSprintTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-create-sprint',
    description: 'Redmineプロジェクトに新しいスプリントを作成します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      name: z.string().describe('スプリント名'),
      sprint_start_date: z
        .string()
        .optional()
        .describe('スプリント開始日（YYYY-MM-DD形式）'),
      sprint_end_date: z
        .string()
        .optional()
        .describe('スプリント終了日（YYYY-MM-DD形式）'),
      status: z
        .number()
        .optional()
        .default(1)
        .describe(
          'スプリントのステータス（1:開始前, 2:進行中, 3:終了, 4:アーカイブ）',
        ),
      is_product_backlog: z
        .boolean()
        .optional()
        .default(false)
        .describe('このスプリントをプロダクトバックログとして扱うかどうか'),
      shared: z
        .boolean()
        .optional()
        .default(false)
        .describe('子プロジェクトとスプリントを共有するかどうか'),
    }),
    outputSchema: z.object({
      sprint: z.object({
        id: z.number(),
        name: z.string(),
        project_id: z.number(),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // スプリントデータの準備
      const sprintData: RedmineSprintData = {
        name: context.name,
        project_id: projectId,
      };

      if (context.sprint_start_date) {
        sprintData.sprint_start_date = context.sprint_start_date;
      }

      if (context.sprint_end_date) {
        sprintData.sprint_end_date = context.sprint_end_date;
      }

      if (context.status) {
        sprintData.status = context.status;
      }

      if (context.is_product_backlog !== undefined) {
        sprintData.is_product_backlog = context.is_product_backlog;
      }

      if (context.shared !== undefined) {
        sprintData.shared = context.shared;
      }

      // API リクエストの実行
      const path = `projects/${projectId}/sprints.json`;
      const response = await client.request<{
        sprint: RedmineSprint;
      }>(path, 'POST', { sprint: sprintData });

      return {
        sprint: {
          id: response.sprint.id,
          name: response.sprint.name,
          project_id: response.sprint.project_id,
        },
      };
    },
  });
};

/**
 * スプリントを更新するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns スプリント更新ツール
 */
export const createUpdateSprintTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-update-sprint',
    description: 'Redmineの既存スプリントを更新します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      sprint_id: z
        .union([z.string(), z.number()])
        .describe('スプリントIDまたは名前'),
      name: z.string().optional().describe('スプリント名'),
      sprint_start_date: z
        .string()
        .optional()
        .describe('スプリント開始日（YYYY-MM-DD形式）'),
      sprint_end_date: z
        .string()
        .optional()
        .describe('スプリント終了日（YYYY-MM-DD形式）'),
      status: z
        .number()
        .optional()
        .describe(
          'スプリントのステータス（1:開始前, 2:進行中, 3:終了, 4:アーカイブ）',
        ),
      is_product_backlog: z
        .boolean()
        .optional()
        .describe('このスプリントをプロダクトバックログとして扱うかどうか'),
      shared: z
        .boolean()
        .optional()
        .describe('子プロジェクトとスプリントを共有するかどうか'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      sprint: z.object({
        id: z.number(),
        name: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;
      let sprintId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // スプリントIDの解決
      if (
        typeof context.sprint_id === 'string' &&
        !Number.isNaN(Number(context.sprint_id))
      ) {
        sprintId = Number(context.sprint_id);
      } else if (typeof context.sprint_id === 'string') {
        const sprints = await client.getSprints(projectId);
        sprintId = await client.resolveId(context.sprint_id, sprints);
      } else {
        sprintId = context.sprint_id as number;
      }

      // 更新データの準備
      const updateData: Partial<RedmineSprintData> = {};

      if (context.name) {
        updateData.name = context.name;
      }

      if (context.sprint_start_date) {
        updateData.sprint_start_date = context.sprint_start_date;
      }

      if (context.sprint_end_date) {
        updateData.sprint_end_date = context.sprint_end_date;
      }

      if (context.status !== undefined) {
        updateData.status = context.status;
      }

      if (context.is_product_backlog !== undefined) {
        updateData.is_product_backlog = context.is_product_backlog;
      }

      if (context.shared !== undefined) {
        updateData.shared = context.shared;
      }

      // 更新内容があるか確認
      if (Object.keys(updateData).length === 0) {
        throw new Error('更新する項目が指定されていません');
      }

      // API リクエストの実行
      const path = `projects/${projectId}/sprints/${sprintId}.json`;
      await client.request(path, 'PUT', { sprint: updateData });

      // 更新後のスプリント詳細を取得
      const updatedSprint = await client.request<{ sprint: RedmineSprint }>(
        `projects/${projectId}/sprints/${sprintId}.json`,
      );

      return {
        success: true,
        sprint: {
          id: updatedSprint.sprint.id,
          name: updatedSprint.sprint.name,
        },
      };
    },
  });
};

/**
 * バックログを取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns バックログ取得ツール
 */
export const createGetBacklogTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-backlog',
    description: 'Redmineプロジェクトのプロダクトバックログを取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
    }),
    outputSchema: z.object({
      backlog: z.object({
        id: z.number(),
        name: z.string(),
        is_product_backlog: z.boolean(),
        issues: z.array(
          z.object({
            id: z.number(),
            subject: z.string(),
            tracker: z.object({
              id: z.number(),
              name: z.string(),
            }),
            status: z.object({
              id: z.number(),
              name: z.string(),
            }),
            story_points: z.number().optional(),
            assigned_to: z
              .object({
                id: z.number(),
                name: z.string(),
              })
              .optional(),
          }),
        ),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // スプリント一覧から、プロダクトバックログを検索
      const sprintsResponse = await client.request<{
        sprints: RedmineSprint[];
      }>(`projects/${projectId}/sprints.json`);

      const productBacklog = sprintsResponse.sprints.find(
        (sprint) => sprint.is_product_backlog,
      );

      if (!productBacklog) {
        throw new Error('プロジェクトにプロダクトバックログが見つかりません');
      }

      // プロダクトバックログの詳細を取得
      const backlogResponse = await client.request<{
        sprint: RedmineSprint & {
          issues: {
            id: number;
            subject: string;
            tracker: {
              id: number;
              name: string;
            };
            status: {
              id: number;
              name: string;
            };
            story_points?: number;
            assigned_to?: {
              id: number;
              name: string;
            };
          }[];
        };
      }>(`projects/${projectId}/sprints/${productBacklog.id}.json`);

      return {
        backlog: {
          id: backlogResponse.sprint.id,
          name: backlogResponse.sprint.name,
          is_product_backlog: backlogResponse.sprint.is_product_backlog,
          issues: backlogResponse.sprint.issues || [],
        },
      };
    },
  });
};

/**
 * バックログにチケットを追加するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns バックログにチケットを追加するツール
 */
export const createAddToBacklogTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-add-to-backlog',
    description:
      'Redmineプロジェクトのプロダクトバックログにチケットを追加します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      issue_id: z.number().describe('チケットID'),
      story_points: z.number().optional().describe('ストーリーポイント'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      issue: z.object({
        id: z.number(),
        subject: z.string().optional(),
      }),
      backlog: z.object({
        id: z.number(),
        name: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // スプリント一覧から、プロダクトバックログを検索
      const sprintsResponse = await client.request<{
        sprints: RedmineSprint[];
      }>(`projects/${projectId}/sprints.json`);

      const productBacklog = sprintsResponse.sprints.find(
        (sprint) => sprint.is_product_backlog,
      );

      if (!productBacklog) {
        throw new Error('プロジェクトにプロダクトバックログが見つかりません');
      }

      // チケット更新データの準備
      const updateData: any = {
        sprint_id: productBacklog.id,
      };

      if (context.story_points !== undefined) {
        updateData.story_points = context.story_points;
      }

      // チケットを更新
      await client.request(`issues/${context.issue_id}.json`, 'PUT', {
        issue: updateData,
      });

      // 更新されたチケット情報を取得
      const updatedIssue = await client.request<{
        issue: {
          id: number;
          subject: string;
        };
      }>(`issues/${context.issue_id}.json`);

      return {
        success: true,
        issue: {
          id: updatedIssue.issue.id,
          subject: updatedIssue.issue.subject,
        },
        backlog: {
          id: productBacklog.id,
          name: productBacklog.name,
        },
      };
    },
  });
};

/**
 * スプリントのバーンダウンチャートデータを取得するツール
 * @param client RedmineClient - Redmine APIクライアント
 * @returns バーンダウンチャートデータ取得ツール
 */
export const createGetBurndownChartDataTool = (client: RedmineClient) => {
  return createTool({
    id: 'redmine-get-burndown-chart-data',
    description: 'Redmineスプリントのバーンダウンチャートデータを取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      sprint_id: z
        .union([z.string(), z.number()])
        .describe('スプリントIDまたは名前'),
    }),
    outputSchema: z.object({
      burndown_data: z.object({
        days: z.array(
          z.object({
            date: z.string(),
            spent_time: z.number(),
            remaining_time: z.number(),
            ideal_time: z.number().optional(),
          }),
        ),
        total_points: z.number(),
        total_hours: z.number(),
      }),
    }),
    execute: async ({ context }) => {
      let projectId: number;
      let sprintId: number;

      // プロジェクトIDの解決
      if (
        typeof context.project_id === 'string' &&
        !Number.isNaN(Number(context.project_id))
      ) {
        projectId = Number(context.project_id);
      } else if (typeof context.project_id === 'string') {
        const projects = await client.getProjects();
        projectId = await client.resolveId(context.project_id, projects);
      } else {
        projectId = context.project_id as number;
      }

      // スプリントIDの解決
      if (
        typeof context.sprint_id === 'string' &&
        !Number.isNaN(Number(context.sprint_id))
      ) {
        sprintId = Number(context.sprint_id);
      } else if (typeof context.sprint_id === 'string') {
        const sprints = await client.getSprints(projectId);
        sprintId = await client.resolveId(context.sprint_id, sprints);
      } else {
        sprintId = context.sprint_id as number;
      }

      // API リクエストの実行
      const path = `projects/${projectId}/sprints/${sprintId}/burndown.json`;
      const response = await client.request<{
        burndown_data: RedmineBurndownData;
      }>(path);

      return {
        burndown_data: response.burndown_data,
      };
    },
  });
};

/**
 * Redmineのスクラム機能操作ツール一式を作成する
 * @param client RedmineClient - Redmine APIクライアント
 * @returns スクラム機能操作ツール一式
 */
export const createScrumTools = (client: RedmineClient) => {
  return {
    getSprintsList: createGetSprintsListTool(client),
    getSprintDetail: createGetSprintDetailTool(client),
    createSprint: createCreateSprintTool(client),
    updateSprint: createUpdateSprintTool(client),
    getBacklog: createGetBacklogTool(client),
    addToBacklog: createAddToBacklogTool(client),
    getBurndownChartData: createGetBurndownChartDataTool(client),
  };
};
