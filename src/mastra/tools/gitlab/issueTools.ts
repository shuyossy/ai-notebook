/**
 * GitLabイシュー操作ツール
 * イシュー一覧取得、詳細取得、作成、更新などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';
import { GitLabIssueData } from './types';

/**
 * イシュー一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns イシュー一覧取得ツール
 */
export const createGetIssuesListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-issues-list',
    description:
      'GitLabのイシュー一覧を取得します。プロジェクト、ステータス、担当者などで絞り込み可能です。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe(
          'プロジェクトIDまたは名前（指定しない場合は全プロジェクトが対象）',
        ),
      state: z
        .enum(['opened', 'closed', 'all'])
        .optional()
        .default('opened')
        .describe('イシューの状態（opened=未解決、closed=解決済、all=全て）'),
      labels: z
        .string()
        .optional()
        .describe('ラベル（カンマ区切りで複数指定可能）'),
      milestone: z.string().optional().describe('マイルストーン名'),
      assignee_id: z
        .union([z.number(), z.string()])
        .optional()
        .describe('担当者ID、ユーザー名、または"me"（自分）'),
      author_id: z
        .union([z.number(), z.string()])
        .optional()
        .describe('作成者ID、ユーザー名、または"me"（自分）'),
      search: z
        .string()
        .optional()
        .describe('検索キーワード（タイトルと説明が対象）'),
      order_by: z
        .enum([
          'created_at',
          'updated_at',
          'priority',
          'due_date',
          'relative_position',
          'label_priority',
          'milestone_due',
          'popularity',
          'weight',
        ])
        .optional()
        .default('created_at')
        .describe('ソート項目'),
      sort: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('ソート順（昇順：asc、降順：desc）'),
      per_page: z
        .number()
        .optional()
        .default(20)
        .describe('1ページあたりの取得数'),
      page: z.number().optional().default(1).describe('ページ番号'),
    }),
    outputSchema: z.object({
      issues: z.array(
        z.object({
          id: z.number(),
          iid: z.number(),
          project_id: z.number(),
          title: z.string(),
          description: z.string().nullable(),
          state: z.string(),
          created_at: z.string(),
          updated_at: z.string(),
          closed_at: z.string().optional(),
          labels: z.any(),
          milestone: z
            .object({
              id: z.number(),
              iid: z.number(),
              project_id: z.number(),
              title: z.string(),
              description: z.string(),
              due_date: z.string().optional(),
              start_date: z.string(),
              state: z.string(),
              updated_at: z.string(),
              created_at: z.string(),
              expired: z.boolean(),
              web_url: z.string(),
            })
            .optional(),
          assignees: z.array(
            z.object({
              id: z.number(),
              name: z.string(),
              username: z.string(),
              avatar_url: z.string().nullable(),
            }),
          ),
          author: z.object({
            id: z.number(),
            name: z.string(),
            username: z.string(),
            avatar_url: z.string().nullable(),
          }),
          user_notes_count: z.number(),
          due_date: z.string(),
          web_url: z.string(),
        }),
      ),
      total: z.number(),
      page: z.number(),
      per_page: z.number(),
      total_pages: z.number(),
    }),
    execute: async ({ context }) => {
      const { issues } = client.getApiResources();

      // APIオプションの準備
      const options: any = {
        state: context.state || 'opened',
        order_by: context.order_by || 'created_at',
        sort: context.sort || 'desc',
        per_page: context.per_page || 20,
        page: context.page || 1,
      };

      // プロジェクトIDの解決
      if (context.project_id) {
        const projectId = await client.resolveProjectId(context.project_id);
        options.projectId = projectId;
      }

      // 各種フィルタ条件の設定
      if (context.labels) {
        options.labels = context.labels;
      }

      if (context.milestone) {
        options.milestone = context.milestone;
      }

      // 担当者IDの解決
      if (context.assignee_id) {
        if (context.assignee_id === 'me') {
          options.assignee_id = 'me';
        } else if (
          typeof context.assignee_id === 'string' &&
          !Number.isNaN(Number(context.assignee_id))
        ) {
          options.assignee_id = Number(context.assignee_id);
        } else if (typeof context.assignee_id === 'string') {
          const assigneeId = await client.resolveUserId(context.assignee_id);
          options.assignee_id = assigneeId;
        } else {
          options.assignee_id = context.assignee_id;
        }
      }

      // 作成者IDの解決
      if (context.author_id) {
        if (context.author_id === 'me') {
          options.author_id = 'me';
        } else if (
          typeof context.author_id === 'string' &&
          !Number.isNaN(Number(context.author_id))
        ) {
          options.author_id = Number(context.author_id);
        } else if (typeof context.author_id === 'string') {
          const authorId = await client.resolveUserId(context.author_id);
          options.author_id = authorId;
        } else {
          options.author_id = context.author_id;
        }
      }

      if (context.search) {
        options.search = context.search;
      }

      // イシュー一覧を取得
      const issuesList = await issues.all({
        showExpanded: true,
        ...options,
      });

      // 新しいGitBeakerでは返り値の形式が異なるため、結果を適切に取り出す
      const data = Array.isArray(issuesList) ? issuesList : [];
      const paginationInfo = {
        total: data.length,
        current: context.page || 1,
        perPage: context.per_page || 20,
        totalPages: Math.ceil(data.length / (context.per_page || 20)),
      };

      return {
        issues: data.map((issue) => ({
          id: issue.id,
          iid: issue.iid,
          project_id: issue.project_id,
          title: issue.title,
          description: issue.description,
          state: issue.state,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          closed_at: issue.closed_at,
          labels: Array.isArray(issue.labels) ? issue.labels : [],
          milestone: issue.milestone,
          assignees: issue.assignees || [],
          author: issue.author,
          user_notes_count: issue.user_notes_count,
          due_date: issue.due_date,
          web_url: issue.web_url,
        })),
        total: paginationInfo.total,
        page: paginationInfo.current,
        per_page: paginationInfo.perPage,
        total_pages: paginationInfo.totalPages,
      };
    },
  });
};

/**
 * 特定のイシュー詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns イシュー詳細取得ツール
 */
export const createGetIssueDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-issue-detail',
    description: 'GitLabの特定のイシュー詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      issue_iid: z.number().describe('イシューのIID（プロジェクト内ID）'),
    }),
    outputSchema: z.object({
      issue: z.object({
        id: z.number(),
        iid: z.number(),
        project_id: z.number(),
        title: z.string(),
        description: z.string().nullable(),
        state: z.string(),
        created_at: z.string(),
        updated_at: z.string(),
        closed_at: z.string().nullable(),
        closed_by: z
          .object({
            id: z.number(),
            name: z.string(),
            username: z.string(),
          })
          .nullable(),
        labels: z.array(z.string()),
        milestone: z
          .object({
            id: z.number(),
            title: z.string(),
            description: z.string().nullable(),
            due_date: z.string().nullable(),
            state: z.string(),
          })
          .nullable(),
        assignees: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            username: z.string(),
            avatar_url: z.string().nullable(),
          }),
        ),
        author: z.object({
          id: z.number(),
          name: z.string(),
          username: z.string(),
          avatar_url: z.string().nullable(),
        }),
        user_notes_count: z.number(),
        upvotes: z.number(),
        downvotes: z.number(),
        due_date: z.string().nullable(),
        confidential: z.boolean(),
        web_url: z.string(),
        time_stats: z
          .object({
            time_estimate: z.number(),
            total_time_spent: z.number(),
            human_time_estimate: z.string().nullable(),
            human_total_time_spent: z.string().nullable(),
          })
          .optional(),
      }),
    }),
    execute: async ({ context }) => {
      const { issues } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // イシュー詳細を取得
      // GitBeakerの最新バージョンでは、issue.showのパラメータ指定方法が変更されている
      const issue = await issues.show(context.issue_iid, {
        projectId,
        showExpanded: true,
      });

      return { issue };
    },
  });
};

/**
 * イシューを作成するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns イシュー作成ツール
 */
export const createCreateIssueTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-create-issue',
    description: 'GitLabに新しいイシューを作成します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      title: z.string().describe('イシューのタイトル'),
      description: z.string().optional().describe('イシューの説明'),
      confidential: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          '機密扱いにするか（trueの場合、一般メンバーには表示されません）',
        ),
      assignee_ids: z
        .array(z.union([z.number(), z.string()]))
        .optional()
        .describe('担当者IDまたはユーザー名の配列'),
      milestone_id: z
        .union([z.number(), z.string()])
        .optional()
        .describe('マイルストーンIDまたは名前'),
      labels: z
        .string()
        .optional()
        .describe('ラベル（カンマ区切りで複数指定可能）'),
      due_date: z.string().optional().describe('期日（YYYY-MM-DD形式）'),
      weight: z.number().optional().describe('重み（数値）'),
    }),
    outputSchema: z.object({
      issue: z.object({
        id: z.number(),
        iid: z.number(),
        project_id: z.number(),
        title: z.string(),
        web_url: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      const { issues } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // イシューデータの準備
      const issueData: GitLabIssueData = {
        title: context.title,
      };

      if (context.description) {
        issueData.description = context.description;
      }

      if (context.confidential !== undefined) {
        issueData.confidential = context.confidential;
      }

      // 担当者IDの解決
      if (context.assignee_ids && context.assignee_ids.length > 0) {
        const resolvedAssigneeIds = await Promise.all(
          context.assignee_ids.map(async (assigneeId) => {
            if (
              typeof assigneeId === 'string' &&
              !Number.isNaN(Number(assigneeId))
            ) {
              return Number(assigneeId);
            } else if (typeof assigneeId === 'string') {
              return await client.resolveUserId(assigneeId);
            } else {
              return assigneeId;
            }
          }),
        );
        issueData.assignee_ids = resolvedAssigneeIds;
      }

      // マイルストーンIDの解決
      if (context.milestone_id) {
        if (
          typeof context.milestone_id === 'string' &&
          !Number.isNaN(Number(context.milestone_id))
        ) {
          issueData.milestone_id = Number(context.milestone_id);
        } else if (typeof context.milestone_id === 'string') {
          // マイルストーン名→IDの解決はGitBeakerで直接サポートされていないため、
          // プロジェクトのマイルストーン一覧を取得して解決する必要があります
          // 現状ではマイルストーンIDを数値で直接指定するか、数値文字列で指定する必要があります
          issueData.milestone_id = context.milestone_id;
        } else {
          issueData.milestone_id = context.milestone_id;
        }
      }

      if (context.labels) {
        issueData.labels = context.labels;
      }

      if (context.due_date) {
        issueData.due_date = context.due_date;
      }

      if (context.weight !== undefined) {
        issueData.weight = context.weight;
      }

      // イシューを作成
      // GitBeakerの最新バージョンでは、issues.createの引数の渡し方が変更されている
      const issue = await issues.create(projectId, {
        ...issueData,
      });

      return {
        issue: {
          id: issue.id,
          iid: issue.iid,
          project_id: issue.project_id,
          title: issue.title,
          web_url: issue.web_url,
        },
      };
    },
  });
};

/**
 * イシューを更新するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns イシュー更新ツール
 */
export const createUpdateIssueTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-update-issue',
    description: 'GitLabの既存イシューを更新します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      issue_iid: z.number().describe('イシューのIID（プロジェクト内ID）'),
      title: z.string().optional().describe('イシューのタイトル'),
      description: z.string().optional().describe('イシューの説明'),
      state_event: z
        .enum(['close', 'reopen'])
        .optional()
        .describe('状態の変更（close=解決済にする、reopen=未解決に戻す）'),
      confidential: z
        .boolean()
        .optional()
        .describe(
          '機密扱いにするか（trueの場合、一般メンバーには表示されません）',
        ),
      assignee_ids: z
        .array(z.union([z.number(), z.string()]))
        .optional()
        .describe('担当者IDまたはユーザー名の配列'),
      milestone_id: z
        .union([z.number(), z.string(), z.null()])
        .optional()
        .describe('マイルストーンIDまたは名前（nullで削除）'),
      labels: z
        .string()
        .optional()
        .describe('ラベル（カンマ区切りで複数指定可能）'),
      due_date: z
        .string()
        .nullable()
        .optional()
        .describe('期日（YYYY-MM-DD形式、nullで削除）'),
      weight: z
        .number()
        .nullable()
        .optional()
        .describe('重み（数値、nullで削除）'),
    }),
    outputSchema: z.object({
      issue: z.object({
        id: z.number(),
        iid: z.number(),
        project_id: z.number(),
        title: z.string(),
        state: z.string(),
        web_url: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      const { issues } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // 更新対象のイシューを取得
      // GitBeakerの最新バージョンでは、issue.showのパラメータ指定方法が変更されている
      const existingIssue = await issues.show(projectId, {
        iid: context.issue_iid,
        showExpanded: true,
      });

      // 更新データの準備
      const updateData: any = {};

      if (context.title !== undefined) {
        updateData.title = context.title;
      }

      if (context.description !== undefined) {
        updateData.description = context.description;
      }

      if (context.state_event) {
        updateData.state_event = context.state_event;
      }

      if (context.confidential !== undefined) {
        updateData.confidential = context.confidential;
      }

      // 担当者IDの解決
      if (context.assignee_ids !== undefined) {
        if (context.assignee_ids.length === 0) {
          updateData.assignee_ids = [0]; // GitLabではassignee_idsに[0]を指定すると担当者を削除する
        } else {
          const resolvedAssigneeIds = await Promise.all(
            context.assignee_ids.map(async (assigneeId) => {
              if (
                typeof assigneeId === 'string' &&
                !Number.isNaN(Number(assigneeId))
              ) {
                return Number(assigneeId);
              } else if (typeof assigneeId === 'string') {
                return await client.resolveUserId(assigneeId);
              } else {
                return assigneeId;
              }
            }),
          );
          updateData.assignee_ids = resolvedAssigneeIds;
        }
      }

      // マイルストーンIDの解決
      if (context.milestone_id !== undefined) {
        if (context.milestone_id === null) {
          updateData.milestone_id = null;
        } else if (
          typeof context.milestone_id === 'string' &&
          !Number.isNaN(Number(context.milestone_id))
        ) {
          updateData.milestone_id = Number(context.milestone_id);
        } else if (typeof context.milestone_id === 'string') {
          // マイルストーン名→IDの解決はGitBeakerで直接サポートされていないため、
          // プロジェクトのマイルストーン一覧を取得して解決する必要があります
          updateData.milestone_id = context.milestone_id;
        } else {
          updateData.milestone_id = context.milestone_id;
        }
      }

      if (context.labels !== undefined) {
        updateData.labels = context.labels;
      }

      if (context.due_date !== undefined) {
        updateData.due_date = context.due_date;
      }

      if (context.weight !== undefined) {
        updateData.weight = context.weight;
      }

      // 更新内容があるか確認
      if (Object.keys(updateData).length === 0) {
        throw new Error('更新する項目が指定されていません');
      }

      // イシューを更新
      // GitBeakerの最新バージョンでは、issues.editの引数の渡し方が変更されている
      const issue = await issues.edit(projectId, context.issue_iid, {
        ...updateData,
      });

      return {
        issue: {
          id: issue.id,
          iid: issue.iid,
          project_id: issue.project_id,
          title: issue.title,
          state: issue.state,
          web_url: issue.web_url,
        },
      };
    },
  });
};

/**
 * GitLabのイシュー操作ツール一式を作成する
 * @param client GitLabClient - GitLab APIクライアント
 * @returns イシュー操作ツール一式
 */
export const createIssueTools = (client: GitLabClient) => {
  return {
    getIssuesList: createGetIssuesListTool(client),
    getIssueDetail: createGetIssueDetailTool(client),
    createIssue: createCreateIssueTool(client),
    updateIssue: createUpdateIssueTool(client),
  };
};
