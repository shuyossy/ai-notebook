/**
 * GitLabマージリクエスト操作ツール
 * マージリクエスト一覧取得、詳細取得、コメント投稿・削除などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';

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
        .describe('プロジェクトIDまたはURLエンコードされたパス'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）'),
    }),
    outputSchema: z.any(),
    execute: async ({ context }) => {
      const { mergeRequests } = client.getApiResources();

      // マージリクエスト詳細を取得
      // GitBeakerの最新バージョンでは、mergeRequests.showのパラメータ指定方法が変更されている
      const mr = await mergeRequests.show(
        context.project_id,
        context.merge_request_iid,
        { showExpanded: true },
      );

      return { mergeRequests: mr.data };
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
        .describe('プロジェクトIDまたはURLエンコードされたパス'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）'),
      body: z.string().describe('コメント本文'),
    }),
    outputSchema: z.any(),
    execute: async ({ context }) => {
      const { mergeRequestNotes } = client.getApiResources();

      // コメントを追加
      const comment = await mergeRequestNotes.create(
        context.project_id,
        context.merge_request_iid,
        context.body,
      );

      return { added_comment: comment };
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
        .describe('プロジェクトIDまたはURLエンコードされたパス'),
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
          lineRange: z
            .object({
              start: z
                .object({
                  lineCode: z.string().describe('スタートラインのラインコード'),
                  type: z
                    .enum(['new', 'old'])
                    .describe(
                      'このコミットによって追加された行には `new` を使用し、そうでない場合は `old` を使用します',
                    ),
                  hash: z
                    .string()
                    .optional()
                    .describe('マルチラインノートの開始行ハッシュ'),
                })
                .describe('マルチラインノートの開始行情報'),
              end: z
                .object({
                  lineCode: z
                    .string()
                    .describe('終了行のラインコード。文字列です'),
                  type: z
                    .enum(['new', 'old'])
                    .describe(
                      'このコミットによって追加された行には `new` を使用し、そうでない場合は `old` を使用します',
                    ),
                  hash: z
                    .string()
                    .optional()
                    .describe('マルチラインノートの終了行ハッシュ'),
                })
                .describe('マルチラインノートの終了行情報'),
            })
            .optional()
            .describe('複数行コメント時専用のパラメータ'),
        })
        .describe('コメントの位置情報'),
    }),
    outputSchema: z.any(),
    execute: async ({ context }) => {
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

      return { added_comment: comment };
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
