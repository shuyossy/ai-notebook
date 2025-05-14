/**
 * GitLabプロジェクト(リポジトリ)操作ツール
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
      'Get file information (name, size, content etc.) from GitLab project. File content is Base64 encoded.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or URL-encoded path (required)'),
      file_path: z
        .string()
        .describe(
          'File path relative to repository root, URL-encoded (e.g., path%2Fto%2Ffile.rb) (required)',
        ),
      ref: z.string().describe('Reference (branch or tag name) (required)'),
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
    description: 'Get raw file content from GitLab project.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or URL-encoded path (required)'),
      file_path: z
        .string()
        .describe(
          'File path relative to repository root, URL-encoded (e.g., path%2Fto%2Ffile.rb) (required)',
        ),
      ref: z.string().describe('Reference (branch or tag name) (required)'),
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
    description: 'Get blame information for a file from GitLab project.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or URL-encoded path (required)'),
      file_path: z
        .string()
        .describe(
          'File path relative to repository root, URL-encoded (e.g., path%2Fto%2Ffile.rb) (required)',
        ),
      ref: z.string().describe('Reference (branch or tag name) (required)'),
      range: z
        .object({
          start: z.number().describe('Start line number (required)'),
          end: z.number().describe('End line number (required)'),
        })
        .optional()
        .describe('Line range to retrieve (optional)'),
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
    description: 'Get directory structure (tree) of GitLab project.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or URL-encoded path (required)'),
      path: z
        .string()
        .optional()
        .describe('Directory path relative to repository root (optional)'),
      ref: z.string().describe('Reference (branch or tag name) (required)'),
      recursive: z
        .boolean()
        .optional()
        .default(true)
        .describe('Recursively get subdirectories (optional)'),
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
