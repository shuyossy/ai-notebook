/**
 * GitLabリポジトリ操作ツール
 * ブランチ一覧取得・作成、タグ一覧取得、ファイルの取得、リポジトリツリー参照、コミット履歴取得などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';
import { createBaseToolResponseSchema, RunToolStatus } from '../types';

/**
 * リポジトリファイルを取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ファイル取得ツール
 */
export const createGetFileContentTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-file-content',
    description:
      '名前、サイズ、内容のようなリポジトリ内のファイルに関する情報を受け取ることができます。ファイルの内容は Base64 エンコードされています。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはURLエンコードされたパス:必須'),
      file_path: z
        .string()
        .describe(
          'リポジトリルートからの相対パスで、URLエンコード済みであること（例えばpath%2Fto%2Ffile.rb）:必須',
        ),
      ref: z.string().describe('リファレンス（ブランチ名、タグ名）:必須'),
    }),
    outputSchema: createBaseToolResponseSchema(
      z.object({
        file: z.any(),
      }),
    ),
    execute: async ({ context }) => {
      let status: RunToolStatus = 'failed';
      try {
        const { repositoryFiles } = client.getApiResources();

        // ファイル内容を取得
        const file = await repositoryFiles.show(
          context.project_id,
          context.file_path,
          context.ref || 'master',
        );

        status = 'success';
        return {
          status,
          result: {
            file,
          },
        };
      } catch (error) {
        status = 'failed';
        return {
          status,
          error: `ファイル内容の取得に失敗しました: ${error}`,
        };
      }
    },
  });
};

/**
 * リポジトリファイルを取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ファイル取得ツール
 */
export const createGetRawFileTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-raw-file',
    description:
      'GitLabリポジトリの特定のファイルを生で取得します（エンコードはされていません）',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはURLエンコードされたパス:必須'),
      file_path: z
        .string()
        .describe(
          'ファイルパス（リポジトリルートからの相対パスで、URLエンコード済みであること（例えばpath%2Fto%2Ffile.rb）:必須',
        ),
      ref: z.string().describe('リファレンス（ブランチ名、タグ名）:必須'),
    }),
    outputSchema: createBaseToolResponseSchema(
      z.object({
        file: z.any(),
      }),
    ),
    execute: async ({ context }) => {
      let status: RunToolStatus = 'failed';
      try {
        const { repositoryFiles } = client.getApiResources();

        // ファイル内容を取得
        const file = await repositoryFiles.showRaw(
          context.project_id,
          context.file_path,
          context.ref || 'master',
        );

        status = 'success';
        return {
          status,
          result: {
            file,
          },
        };
      } catch (error) {
        status = 'failed';
        return {
          status,
          error: `生ファイルの取得に失敗しました: ${error}`,
        };
      }
    },
  });
};

/**
 * リポジトリファイルを取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns ファイル取得ツール
 */
export const createGeBlameFileTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-blame-file',
    description: 'GitLabリポジトリの特定のblameファイルを取得します',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはURLエンコードされたパス:必須'),
      file_path: z
        .string()
        .describe(
          'ファイルパス（リポジトリルートからの相対パスで、URLエンコード済みであること（例えばpath%2Fto%2Ffile.rb））:必須',
        ),
      ref: z.string().describe('リファレンス（ブランチ名、タグ名）:必須'),
      range: z
        .object({
          start: z.number().describe('開始行:必須'),
          end: z.number().describe('終了行:必須'),
        })
        .optional()
        .describe('取得する行の範囲:任意'),
    }),
    outputSchema: createBaseToolResponseSchema(
      z.object({
        file: z.any(),
      }),
    ),
    execute: async ({ context }) => {
      let status: RunToolStatus = 'failed';
      try {
        const { repositoryFiles } = client.getApiResources();

        // ファイル内容を取得
        const file = await repositoryFiles.allFileBlames(
          context.project_id,
          context.file_path,
          context.ref || 'master',
          { range: context.range },
        );

        status = 'success';
        return {
          status,
          result: {
            file,
          },
        };
      } catch (error) {
        status = 'failed';
        return {
          status,
          error: `blameファイルの取得に失敗しました: ${error}`,
        };
      }
    },
  });
};

/**
 * リポジトリツリーを取得するツール
 * @param client GitLabClient - GitLab APIクライアント
 * @returns リポジトリツリー取得ツール
 */
export const createGetRepositoryTreeTool = (client: GitLabClient) => {
  return createTool({
    id: 'gitlab-get-repository-tree',
    description: 'GitLabリポジトリのディレクトリ構造（ツリー）を取得します。',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('プロジェクトIDまたはURLエンコードされたパス:必須'),
      path: z
        .string()
        .optional()
        .describe(
          '取得するディレクトリパス（リポジトリルートからの相対パス）:任意',
        ),
      ref: z.string().describe('リファレンス（ブランチ名、タグ名）:必須'),
      recursive: z
        .boolean()
        .optional()
        .default(true)
        .describe('サブディレクトリを再帰的に取得するか:任意'),
    }),
    outputSchema: createBaseToolResponseSchema(
      z.object({
        tree: z.array(z.any()),
      }),
    ),
    execute: async ({ context }) => {
      let status: RunToolStatus = 'failed';
      try {
        const { repositories } = client.getApiResources();

        // リポジトリツリーを取得
        const treeItems = await repositories.allRepositoryTrees(
          context.project_id,
          {
            ref: context.ref,
            recursive: context.recursive,
            path: context.path,
          },
        );

        status = 'success';
        return {
          status,
          result: {
            tree: treeItems,
          },
        };
      } catch (error) {
        status = 'failed';
        return {
          status,
          error: `リポジトリツリーの取得に失敗しました: ${error}`,
        };
      }
    },
  });
};

/**
 * GitLabのリポジトリ操作ツール一式を作成する
 * @param client GitLabClient - GitLab APIクライアント
 * @returns リポジトリ操作ツール一式
 */
export const createRepositoryTools = (client: GitLabClient) => {
  return {
    getGitLabFileContent: createGetFileContentTool(client),
    getGitLabRawFile: createGetRawFileTool(client),
    getGitLabBlameFile: createGeBlameFileTool(client),
    getGitLabRepositoryTree: createGetRepositoryTreeTool(client),
  };
};
