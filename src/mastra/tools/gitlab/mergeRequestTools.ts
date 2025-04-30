/**
 * GitLabマージリクエスト操作ツール
 * マージリクエスト一覧取得、詳細取得、コメント投稿・削除などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';
import { GitLabMergeRequestData } from './types';

/**
 * マージリクエスト一覧を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns マージリクエスト一覧取得ツール
 */
export const createGetMergeRequestsListTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-merge-requests-list',
    description:
      'GitLabのマージリクエスト一覧を取得します。プロジェクト、ステータス、ブランチなどで絞り込み可能です。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .optional()
        .describe('プロジェクトIDまたは名前'),
      state: z
        .enum(['opened', 'closed', 'locked', 'merged', 'all'])
        .optional()
        .default('all')
        .describe(
          'マージリクエストの状態（opened=未マージ、merged=マージ済み、closed=閉じられた、locked=ロック済み、all=全て）',
        ),
      order_by: z
        .enum(['created_at', 'updated_at', 'title', 'merged_at'])
        .optional()
        .default('created_at')
        .describe('ソート項目'),
      sort: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('ソート順（昇順：asc、降順：desc）'),
      milestone: z.string().optional().describe('マイルストーン名'),
      labels: z
        .string()
        .optional()
        .describe('ラベル（カンマ区切りで複数指定可能）'),
      author_id: z
        .union([z.number(), z.string()])
        .optional()
        .describe('作成者ID、ユーザー名、または"me"（自分）'),
      assignee_id: z
        .union([z.number(), z.string()])
        .optional()
        .describe('担当者ID、ユーザー名、または"me"（自分）'),
      reviewer_id: z
        .union([z.number(), z.string()])
        .optional()
        .describe('レビュアーID、ユーザー名、または"me"（自分）'),
      target_branch: z.string().optional().describe('ターゲットブランチ名'),
      source_branch: z.string().optional().describe('ソースブランチ名'),
      search: z
        .string()
        .optional()
        .describe('検索キーワード（タイトルと説明が対象）'),
      per_page: z
        .number()
        .optional()
        .default(20)
        .describe('1ページあたりの取得数'),
      page: z.number().optional().default(1).describe('ページ番号'),
    }),
    outputSchema: z.object({
      merge_requests: z.array(
        z.object({
          id: z.number(),
          iid: z.number(),
          project_id: z.number(),
          title: z.string(),
          description: z.string().nullable(),
          state: z.string(),
          created_at: z.string(),
          updated_at: z.string(),
          merged_at: z.string().nullable(),
          closed_at: z.string().nullable(),
          target_branch: z.string(),
          source_branch: z.string(),
          author: z.object({
            id: z.number(),
            name: z.string(),
            username: z.string(),
          }),
          assignees: z.array(
            z.object({
              id: z.number(),
              name: z.string(),
              username: z.string(),
            }),
          ),
          reviewers: z.array(
            z.object({
              id: z.number(),
              name: z.string(),
              username: z.string(),
            }),
          ),
          labels: z.array(z.record(z.string(), z.unknown())),
          merge_status: z.string(),
          web_url: z.string(),
        }),
      ),
      total: z.number(),
      page: z.number(),
      per_page: z.number(),
      total_pages: z.number(),
    }),
    execute: async ({ context }) => {
      const { mergeRequests } = client.getApiResources();

      // APIオプションの準備
      const options: any = {
        state: context.state || 'all',
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
      if (context.milestone) {
        options.milestone = context.milestone;
      }

      if (context.labels) {
        options.labels = context.labels;
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

      // レビュアーIDの解決
      if (context.reviewer_id) {
        if (context.reviewer_id === 'me') {
          options.reviewer_id = 'me';
        } else if (
          typeof context.reviewer_id === 'string' &&
          !Number.isNaN(Number(context.reviewer_id))
        ) {
          options.reviewer_id = Number(context.reviewer_id);
        } else if (typeof context.reviewer_id === 'string') {
          const reviewerId = await client.resolveUserId(context.reviewer_id);
          options.reviewer_id = reviewerId;
        } else {
          options.reviewer_id = context.reviewer_id;
        }
      }

      if (context.target_branch) {
        options.target_branch = context.target_branch;
      }

      if (context.source_branch) {
        options.source_branch = context.source_branch;
      }

      if (context.search) {
        options.search = context.search;
      }

      // マージリクエスト一覧を取得
      const mrList = await mergeRequests.all({
        showExpanded: true,
        ...options,
      });

      // 新しいGitBeakerでは返り値の形式が異なるため、結果を適切に取り出す
      const data = Array.isArray(mrList) ? mrList : [];
      const paginationInfo = {
        total: data.length,
        current: context.page || 1,
        perPage: context.per_page || 20,
        totalPages: Math.ceil(data.length / (context.per_page || 20)),
      };

      return {
        merge_requests: data.map((mr) => ({
          id: mr.id,
          iid: mr.iid,
          project_id: mr.project_id,
          title: mr.title,
          description: mr.description,
          state: mr.state,
          created_at: mr.created_at,
          updated_at: mr.updated_at,
          merged_at: mr.merged_at,
          closed_at: mr.closed_at,
          target_branch: mr.target_branch,
          source_branch: mr.source_branch,
          author: {
            id: mr.author.id,
            name: mr.author.name,
            username: mr.author.username,
          },
          assignees: mr.assignees || [],
          reviewers: mr.reviewers || [],
          labels: Array.isArray(mr.labels) ? mr.labels : [],
          merge_status: mr.merge_status,
          web_url: mr.web_url,
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
 * 特定のマージリクエスト詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns マージリクエスト詳細取得ツール
 */
export const createGetMergeRequestDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-merge-request-detail',
    description: 'GitLabの特定のマージリクエスト詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）'),
    }),
    outputSchema: z.object({
      merge_request: z.object({
        id: z.number(),
        iid: z.number(),
        project_id: z.number(),
        title: z.string(),
        description: z.string().nullable(),
        state: z.string(),
        created_at: z.string(),
        updated_at: z.string(),
        merged_at: z.string().nullable(),
        closed_at: z.string().nullable(),
        target_branch: z.string(),
        source_branch: z.string(),
        source_project_id: z.number(),
        target_project_id: z.number(),
        author: z.object({
          id: z.number(),
          name: z.string(),
          username: z.string(),
          avatar_url: z.string().nullable(),
        }),
        assignees: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            username: z.string(),
            avatar_url: z.string().nullable(),
          }),
        ),
        reviewers: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            username: z.string(),
            avatar_url: z.string().nullable(),
          }),
        ),
        labels: z
          .array(z.record(z.string(), z.unknown()))
          .or(z.array(z.string())),
        draft: z.boolean(),
        work_in_progress: z.boolean(),
        merge_status: z.string(),
        detailed_merge_status: z.string(),
        user_notes_count: z.number(),
        web_url: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      const { mergeRequests } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // マージリクエスト詳細を取得
      // GitBeakerの最新バージョンでは、mergeRequests.showのパラメータ指定方法が変更されている
      const mr = await mergeRequests.show(
        projectId,
        context.merge_request_iid,
        { showExpanded: true },
      );

      return {
        merge_request: {
          id: mr.data.id,
          iid: mr.data.iid,
          project_id: mr.data.project_id,
          title: mr.data.title,
          description: mr.data.description,
          state: mr.data.state,
          created_at: mr.data.created_at,
          updated_at: mr.data.updated_at,
          merged_at: mr.data.merged_at,
          closed_at: mr.data.closed_at,
          target_branch: mr.data.target_branch,
          source_branch: mr.data.source_branch,
          source_project_id: mr.data.source_project_id,
          target_project_id: mr.data.target_project_id,
          author: mr.data.author,
          assignees: mr.data.assignees || [],
          reviewers: mr.data.reviewers || [],
          labels: Array.isArray(mr.data.labels) ? mr.data.labels : [],
          draft: mr.data.draft || mr.data.work_in_progress,
          work_in_progress: mr.data.work_in_progress,
          merge_status: mr.data.merge_status,
          detailed_merge_status: mr.data.detailed_merge_status,
          user_notes_count: mr.data.user_notes_count,
          web_url: mr.data.web_url,
        },
      };
    },
  });
};

/**
 * マージリクエストを作成するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns マージリクエスト作成ツール
 */
export const createCreateMergeRequestTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-create-merge-request',
    description: 'GitLabに新しいマージリクエストを作成します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      source_branch: z
        .string()
        .describe('ソースブランチ名（変更を含むブランチ）'),
      target_branch: z
        .string()
        .describe('ターゲットブランチ名（マージ先のブランチ）'),
      title: z.string().describe('マージリクエストのタイトル'),
      description: z.string().optional().describe('マージリクエストの説明'),
      assignee_ids: z
        .array(z.union([z.number(), z.string()]))
        .optional()
        .describe('担当者IDまたはユーザー名の配列'),
      reviewer_ids: z
        .array(z.union([z.number(), z.string()]))
        .optional()
        .describe('レビュアーIDまたはユーザー名の配列'),
      labels: z
        .string()
        .optional()
        .describe('ラベル（カンマ区切りで複数指定可能）'),
      milestone_id: z.number().optional().describe('マイルストーンID'),
      remove_source_branch: z
        .boolean()
        .optional()
        .default(false)
        .describe('マージ後にソースブランチを削除するか'),
      squash: z
        .boolean()
        .optional()
        .default(false)
        .describe('マージ時にコミットをスカッシュするか'),
    }),
    outputSchema: z.object({
      merge_request: z.object({
        id: z.number(),
        iid: z.number(),
        project_id: z.number(),
        title: z.string(),
        source_branch: z.string(),
        target_branch: z.string(),
        state: z.string(),
        web_url: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      const { mergeRequests } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // マージリクエストデータの準備
      const mrData: GitLabMergeRequestData = {
        source_branch: context.source_branch,
        target_branch: context.target_branch,
        title: context.title,
      };

      if (context.description) {
        mrData.description = context.description;
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
            }
            if (typeof assigneeId === 'string') {
              return client.resolveUserId(assigneeId);
            }
            return assigneeId;
          }),
        );
        mrData.assignee_ids = resolvedAssigneeIds;
      }

      // レビュアーIDの解決
      if (context.reviewer_ids && context.reviewer_ids.length > 0) {
        const resolvedReviewerIds = await Promise.all(
          context.reviewer_ids.map(async (reviewerId) => {
            if (
              typeof reviewerId === 'string' &&
              !Number.isNaN(Number(reviewerId))
            ) {
              return Number(reviewerId);
            }
            if (typeof reviewerId === 'string') {
              return client.resolveUserId(reviewerId);
            }
            return reviewerId;
          }),
        );
        mrData.reviewer_ids = resolvedReviewerIds;
      }

      if (context.labels) {
        mrData.labels = context.labels;
      }

      if (context.milestone_id) {
        mrData.milestone_id = context.milestone_id;
      }

      if (context.remove_source_branch !== undefined) {
        mrData.remove_source_branch = context.remove_source_branch;
      }

      if (context.squash !== undefined) {
        mrData.squash = context.squash;
      }

      // マージリクエストを作成
      const mr = await mergeRequests.create(
        projectId,
        mrData.source_branch,
        mrData.target_branch,
        mrData.title,
        { ...mrData },
      );

      return {
        merge_request: {
          id: mr.id,
          iid: mr.iid,
          project_id: mr.project_id,
          title: mr.title,
          source_branch: mr.source_branch,
          target_branch: mr.target_branch,
          state: mr.state,
          web_url: mr.web_url,
        },
      };
    },
  });
};

/**
 * マージリクエストにコメントを追加するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns マージリクエストコメント追加ツール
 */
export const createAddMergeRequestCommentTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-add-merge-request-comment',
    description: 'GitLabのマージリクエストにコメントを追加します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）'),
      body: z.string().describe('コメント本文'),
    }),
    outputSchema: z.object({
      comment: z.object({
        id: z.number(),
        body: z.string(),
        author: z.object({
          id: z.number(),
          name: z.string(),
          username: z.string(),
        }),
        created_at: z.string(),
        updated_at: z.string(),
      }),
    }),
    execute: async ({ context }) => {
      const { mergeRequestNotes } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // コメントを追加
      const comment = await mergeRequestNotes.create(
        projectId,
        context.merge_request_iid,
        context.body,
      );

      return {
        comment: {
          id: comment.id,
          body: comment.body,
          author: {
            id: comment.author.id,
            name: comment.author.name,
            username: comment.author.username,
          },
          created_at: comment.created_at,
          updated_at: comment.updated_at,
        },
      };
    },
  });
};

/**
 * マージリクエストの差分（Diff）にコメントを追加するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns マージリクエストDiffコメント追加ツール
 */
export const createAddMergeRequestDiffCommentTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-add-merge-request-diff-comment',
    description:
      'GitLabのマージリクエストの差分（Diff）にコメントを追加します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたは名前'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）'),
      body: z.string().describe('コメント本文'),
      position: z
        .object({
          baseSha: z.string().describe('ソースブランチのベースコミットSHA'),
          startSha: z
            .string()
            .describe('	ターゲットブランチのコミットを参照するSHA'),
          headSha: z.string().describe('ヘッドコミットのSHA'),
          oldPath: z.string().describe('変更前のファイルパス'),
          newPath: z.string().describe('変更後のファイルパス'),
          oldLine: z.string().optional().describe('変更前の行番号'),
          newLine: z.string().optional().describe('変更後の行番号'),
        })
        .describe('コメントの位置情報'),
    }),
    outputSchema: z.object({
      comment: z.object({
        id: z.string(),
        individual_note: z.boolean(),
        notes: z
          .array(
            z.object({
              id: z.number(),
              type: z.enum(['DiffNote', 'DiscussionNote']).nullable(),
              body: z.string(),
              attachment: z.string().nullable(),
              author: z.any(),
              created_at: z.string(),
              updated_at: z.string(),
              system: z.boolean(),
              noteable_id: z.number(),
              noteable_type: z.enum([
                'Issue',
                'Snippet',
                'Epic',
                'Commit',
                'MergeRequest',
              ]),
              noteable_iid: z.number().nullable(),
              resolvable: z.boolean(),
            }),
          )
          .optional(),
      }),
    }),
    execute: async ({ context }) => {
      const { mergeRequestDiscussions } = client.getApiResources();

      // プロジェクトIDを解決
      const projectId = await client.resolveProjectId(context.project_id);

      // Diffコメントを追加
      const comment = await mergeRequestDiscussions.create(
        projectId,
        context.merge_request_iid,
        context.body,
        {
          position: { positionType: 'text', ...context.position },
        },
      );

      return {
        comment: {
          id: comment.id,
          individual_note: comment.individual_note,
          notes: comment.notes,
        },
      };
    },
  });
};

/**
 * GitLabのマージリクエスト操作ツール一式を作成する
 * @param client GitLabClient - GitLab APIクライアント
 * @returns マージリクエスト操作ツール一式
 */
export const createMergeRequestTools = (client: GitLabClient) => {
  return {
    getMergeRequestsList: createGetMergeRequestsListTool(client),
    getMergeRequestDetail: createGetMergeRequestDetailTool(client),
    createMergeRequest: createCreateMergeRequestTool(client),
    addMergeRequestComment: createAddMergeRequestCommentTool(client),
    addMergeRequestDiffComment: createAddMergeRequestDiffCommentTool(client),
  };
};
