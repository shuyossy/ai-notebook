/**
 * GitLabプロジェクト(リポジトリ)操作ツール
 * ブランチ一覧取得・作成、タグ一覧取得、ファイルの取得、リポジトリツリー参照、コミット履歴取得などの操作を提供
 */

// @ts-ignore
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
      'Retrieves file information (name, size, content) from a GitLab repository. File content is Base64 encoded.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or non-encoded project path (required)'),
      file_path: z
        .string()
        .describe(
          'Non-encoded relative path from repository root (required)',
        ),
      ref: z.string().describe('Branch name or tag (required)'),
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
          error: `Failed to retrieve file content: ${error}`,
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
      'Fetches raw file content from a GitLab repository without encoding.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or non-encoded project path (required)'),
      file_path: z
        .string()
        .describe(
          'Non-encoded relative path from repository root (required)',
        ),
      ref: z.string().describe('Branch name or tag (required)'),
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
          error: `Failed to retrieve raw file: ${error}`,
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
    description:
      'Retrieves blame information for a specific file in a GitLab repository.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or non-encoded project path (required)'),
      file_path: z
        .string()
        .describe(
          'Non-encoded relative path from repository root (required)',
        ),
      ref: z.string().describe('Branch name or tag (required)'),
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
          error: `Failed to retrieve blame information: ${error}`,
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
    description:
      'Fetches the directory structure (tree) of a GitLab repository.',
    inputSchema: z.object({
      project_id: z
        .union([z.string(), z.number()])
        .describe('Project ID or non-encoded project path (required)'),
      path: z
        .string()
        .optional()
        .describe(
          'Directory path relative to repository root (optional)',
        ),
      ref: z.string().describe('Branch name or tag (required)'),
      recursive: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to recursively fetch subdirectories (optional)'),
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
          error: `Failed to retrieve repository tree: ${error}`,
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
