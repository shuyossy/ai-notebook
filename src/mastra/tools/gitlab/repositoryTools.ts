/**
 * GitLabリポジトリ操作ツール
 * ブランチ一覧取得・作成、タグ一覧取得、ファイルの取得、リポジトリツリー参照、コミット履歴取得などの操作を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GitLabClient } from './gitlabClient';

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
        .describe('プロジェクトIDまたはURLエンコードされたパス'),
      file_path: z
        .string()
        .describe(
          '（リポジトリルートからの相対パスで、URLエンコード済みであること（例えばpath%2Fto%2Ffile.rb）',
        ),
      ref: z
        .string()
        .optional()
        .default('master')
        .describe('リファレンス（ブランチ名、タグ名）'),
    }),
    outputSchema: z.object({
      file: z.any(),
    }),
    execute: async ({ context }) => {
      const { repositoryFiles } = client.getApiResources();

      // ファイル内容を取得
      const file = await repositoryFiles.show(
        context.project_id,
        context.file_path,
        context.ref || 'master',
      );

      return { file };
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
        .describe('プロジェクトIDまたはURLエンコードされたパス'),
      file_path: z
        .string()
        .describe(
          'ファイルパス（リポジトリルートからの相対パスで、URLエンコード済みであること（例えばpath%2Fto%2Ffile.rb）',
        ),
      ref: z
        .string()
        .optional()
        .default('master')
        .describe('リファレンス（ブランチ名、タグ名）'),
    }),
    outputSchema: z.any(),
    execute: async ({ context }) => {
      const { repositoryFiles } = client.getApiResources();

      // ファイル内容を取得
      const file = await repositoryFiles.showRaw(
        context.project_id,
        context.file_path,
        context.ref || 'master',
      );

      return { file };
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
        .describe('プロジェクトIDまたはURLエンコードされたパス'),
      file_path: z
        .string()
        .describe(
          'ファイルパス（リポジトリルートからの相対パスで、URLエンコード済みであること（例えばpath%2Fto%2Ffile.rb））',
        ),
      ref: z
        .string()
        .optional()
        .default('master')
        .describe('リファレンス（ブランチ名、タグ名）'),
      range: z
        .object({
          start: z.number().describe('開始行'),
          end: z.number().describe('終了行'),
        })
        .optional()
        .describe('取得する行の範囲'),
    }),
    outputSchema: z.any(),
    execute: async ({ context }) => {
      const { repositoryFiles } = client.getApiResources();

      // ファイル内容を取得
      const file = await repositoryFiles.allFileBlames(
        context.project_id,
        context.file_path,
        context.ref || 'master',
        { range: context.range },
      );

      return { file };
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
        .describe('プロジェクトIDまたはURLエンコードされたパス'),
      path: z
        .string()
        .optional()
        .describe('取得するディレクトリパス（リポジトリルートからの相対パス）'),
      ref: z.string().optional().describe('リファレンス（ブランチ名、タグ名）'),
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe('サブディレクトリを再帰的に取得するか'),
    }),
    outputSchema: z.any(),
    execute: async ({ context }) => {
      const { repositories } = client.getApiResources();

      // リポジトリツリーを取得
      const treeItems = await repositories.allRepositoryTrees(
        context.project_id,
        { ref: context.ref, recursive: context.recursive, path: context.path },
      );

      return {
        tree: treeItems,
      };
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
    getFileContent: createGetFileContentTool(client),
    getRawFile: createGetRawFileTool(client),
    getBlameFile: createGeBlameFileTool(client),
    getRepositoryTree: createGetRepositoryTreeTool(client),
  };
};
