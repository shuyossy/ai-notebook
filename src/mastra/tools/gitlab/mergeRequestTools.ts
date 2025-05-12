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
    description:
      'GitLabプロジェクト(リポジトリ)の特定のマージリクエスト詳細を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはプロジェクトの非エンコードパス:必須'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）:必須'),
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
    description:
      'GitLabプロジェクト(リポジトリ)のマージリクエストにコメントを追加します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはプロジェクトの非エンコードパス:必須'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）:必須'),
      body: z.string().describe('コメント本文:必須'),
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
    description:
      'GitLabプロジェクト(リポジトリ)のマージリクエストの差分（Diff）にコメントを追加します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはプロジェクトの非エンコードパス:必須'),
      merge_request_iid: z
        .number()
        .describe('マージリクエストのIID（プロジェクト内ID）:必須'),
      body: z.string().describe('コメント本文:必須'),
      position: z
        .object({
          baseSha: z
            .string()
            .describe('ソースブランチのベースコミットSHA:必須'),
          startSha: z
            .string()
            .describe('ターゲットブランチのコミットを参照するSHA:必須'),
          headSha: z.string().describe('ヘッドコミットのSHA:必須'),
          oldPath: z.string().describe('変更前のファイルパス:必須'),
          newPath: z.string().describe('変更後のファイルパス:必須'),
          oldLine: z.string().optional().describe('変更前の行番号:任意'),
          newLine: z.string().optional().describe('変更後の行番号:任意'),
          lineRange: z
            .object({
              start: z
                .object({
                  lineCode: z
                    .string()
                    .describe('スタートラインのラインコード:必須'),
                  type: z
                    .enum(['new', 'old'])
                    .describe(
                      'このコミットによって追加された行には `new` を使用し、そうでない場合は `old` を使用します:必須',
                    ),
                  hash: z
                    .string()
                    .optional()
                    .describe('マルチラインノートの開始行ハッシュ:任意'),
                })
                .describe('マルチラインノートの開始行情報'),
              end: z
                .object({
                  lineCode: z
                    .string()
                    .describe('終了行のラインコード。文字列です:必須'),
                  type: z
                    .enum(['new', 'old'])
                    .describe(
                      'このコミットによって追加された行には `new` を使用し、そうでない場合は `old` を使用します:必須',
                    ),
                  hash: z
                    .string()
                    .optional()
                    .describe('マルチラインノートの終了行ハッシュ:任意'),
                })
                .describe('マルチラインノートの終了行情報'),
            })
            .optional()
            .describe('複数行コメント時専用のパラメータ:任意'),
        })
        .describe('コメントの位置情報:必須'),
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
