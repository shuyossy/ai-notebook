/**
 * GitLabマージリクエスト操作ツール
 * マージリクエスト一覧取得、詳細取得、コメント投稿・削除などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';
import { createBaseToolResponseSchema, RunToolStatus } from '../types';

/**
 * 特定のマージリクエスト詳細を取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns マージリクエスト詳細取得ツール
 */
export const createGetMergeRequestDetailTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-merge-request-detail',
    description: 'Get detailed information for a specific merge request.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or URL-encoded path (required)'),
      merge_request_iid: z
        .number()
        .describe('Merge request IID (project-specific ID) (required)'),
    }),
    outputSchema: createBaseToolResponseSchema(
      z.object({
        mergeRequest: z.any(),
      }),
    ),
    execute: async ({ context }) => {
      let status: RunToolStatus = 'failed';
      try {
        const { mergeRequests } = client.getApiResources();

        // マージリクエスト詳細を取得
        // GitBeakerの最新バージョンでは、mergeRequests.showのパラメータ指定方法が変更されている
        const mr = await mergeRequests.show(
          context.project_id,
          context.merge_request_iid,
          { showExpanded: true },
        );

        status = 'success';
        return {
          status,
          result: {
            mergeRequest: mr.data,
          },
        };
      } catch (error) {
        status = 'failed';
        return {
          status,
          error: `マージリクエストの取得に失敗しました: ${error}`,
        };
      }
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
    description: 'Add a comment to a merge request.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or URL-encoded path (required)'),
      merge_request_iid: z
        .number()
        .describe('Merge request IID (project-specific ID) (required)'),
      body: z.string().describe('Comment content (required)'),
    }),
    outputSchema: createBaseToolResponseSchema(
      z.object({
        added_comment: z.any(),
      }),
    ),
    execute: async ({ context }) => {
      let status: RunToolStatus = 'failed';
      try {
        const { mergeRequestNotes } = client.getApiResources();

        // コメントを追加
        const comment = await mergeRequestNotes.create(
          context.project_id,
          context.merge_request_iid,
          context.body,
        );

        status = 'success';
        return {
          status,
          result: {
            added_comment: comment,
          },
        };
      } catch (error) {
        status = 'failed';
        return {
          status,
          error: `マージリクエストへのコメント追加に失敗しました: ${error}`,
        };
      }
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
    description: 'Add a comment to a specific line in merge request diff.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or URL-encoded path (required)'),
      merge_request_iid: z
        .number()
        .describe('Merge request IID (project-specific ID) (required)'),
      body: z.string().describe('Comment content (required)'),
      position: z
        .object({
          baseSha: z
            .string()
            .describe('Base commit SHA of source branch (required)'),
          startSha: z
            .string()
            .describe('Start commit SHA of target branch (required)'),
          headSha: z.string().describe('Head commit SHA (required)'),
          oldPath: z.string().describe('Previous file path (required)'),
          newPath: z.string().describe('New file path (required)'),
          oldLine: z
            .string()
            .optional()
            .describe('Previous line number (optional)'),
          newLine: z.string().optional().describe('New line number (optional)'),
          lineRange: z
            .object({
              start: z
                .object({
                  lineCode: z.string().describe('Start line code (required)'),
                  type: z
                    .enum(['new', 'old'])
                    .describe(
                      'Use "new" for lines added in this commit, "old" otherwise (required)',
                    ),
                  hash: z
                    .string()
                    .optional()
                    .describe(
                      'Hash for start line in multiline note (optional)',
                    ),
                })
                .describe('Start line information for multiline note'),
              end: z
                .object({
                  lineCode: z.string().describe('End line code (required)'),
                  type: z
                    .enum(['new', 'old'])
                    .describe(
                      'Use "new" for lines added in this commit, "old" otherwise (required)',
                    ),
                  hash: z
                    .string()
                    .optional()
                    .describe('Hash for end line in multiline note (optional)'),
                })
                .describe('End line information for multiline note'),
            })
            .optional()
            .describe('Parameters for multiline comments (optional)'),
        })
        .describe('Comment position information (required)'),
    }),
    outputSchema: createBaseToolResponseSchema(
      z.object({
        added_comment: z.any(),
      }),
    ),
    execute: async ({ context }) => {
      let status: RunToolStatus = 'failed';
      try {
        const { mergeRequestDiscussions } = client.getApiResources();

        // Diffコメントを追加
        const comment = await mergeRequestDiscussions.create(
          context.project_id,
          context.merge_request_iid,
          context.body,
          {
            position: { positionType: 'text', ...context.position },
          },
        );

        status = 'success';
        return {
          status,
          result: {
            added_comment: comment,
          },
        };
      } catch (error) {
        status = 'failed';
        return {
          status,
          error: `マージリクエストのDiffコメント追加に失敗しました: ${error}`,
        };
      }
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
    getMergeRequestDetail: createGetMergeRequestDetailTool(client),
    addMergeRequestComment: createAddMergeRequestCommentTool(client),
    addMergeRequestDiffComment: createAddMergeRequestDiffCommentTool(client),
  };
};
