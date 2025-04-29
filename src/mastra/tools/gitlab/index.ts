/**
 * GitLab操作ツールのメインファイル
 * GitLabクライアントとGitLab操作用のツール群を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  GitLabClient,
  createGitLabClient,
  gitlabClientConfigSchema,
} from './gitlabClient';
import { createRepositoryTools } from './repositoryTools';
import { createIssueTools } from './issueTools';
import { createMergeRequestTools } from './mergeRequestTools';
import { createCiCdTools } from './cicdTools';

/**
 * GitLab操作ツール一式を作成する
 * @param config GitLab APIクライアント設定
 * @returns GitLab操作ツール一式
 */
export const createGitLabTools = (config: { host: string; token: string }) => {
  const client = createGitLabClient(config);

  // 各ツールグループを作成
  const repositoryTools = createRepositoryTools(client);
  const issueTools = createIssueTools(client);
  const mergeRequestTools = createMergeRequestTools(client);
  const cicdTools = createCiCdTools(client);

  // GitLabクライアント設定を検証するツール
  const validateGitLabConfig = createTool({
    id: 'gitlab-validate-config',
    description: 'GitLab API接続設定を検証します。',
    inputSchema: z.object({}),
    outputSchema: z.object({
      valid: z.boolean(),
      message: z.string(),
      projects: z
        .array(
          z.object({
            id: z.number(),
            name: z.string(),
            path_with_namespace: z.string(),
          }),
        )
        .optional(),
    }),
    execute: async () => {
      try {
        // プロジェクト一覧を取得してAPI接続が正常か確認
        const projects = await client.getProjects();
        return {
          valid: true,
          message: 'GitLab API接続が正常に確立されました。',
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            path_with_namespace: (project as any).path_with_namespace || '',
          })),
        };
      } catch (error) {
        let errorMessage = 'GitLab API接続に失敗しました。';
        if (error instanceof Error) {
          errorMessage += ` エラー: ${error.message}`;
        }
        return {
          valid: false,
          message: errorMessage,
        };
      }
    },
  });

  // GitLab基本情報を取得するツール
  const getGitLabInfo = createTool({
    id: 'gitlab-get-info',
    description:
      'GitLabインスタンスの基本情報（プロジェクト、グループ、ユーザーなど）を取得します。',
    inputSchema: z.object({}),
    outputSchema: z.object({
      projects: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          path_with_namespace: z.string(),
        }),
      ),
      groups: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          path: z.string(),
        }),
      ),
      users: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          username: z.string(),
        }),
      ),
    }),
    execute: async () => {
      // 各種マスタ情報を取得
      const [projects, groups, users] = await Promise.all([
        client.getProjects(),
        client.getGroups(),
        client.getUsers(),
      ]);

      return {
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          path_with_namespace: (project as any).path_with_namespace || '',
        })),
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          path: (group as any).path || '',
        })),
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          username: (user as any).username || '',
        })),
      };
    },
  });

  // すべてのツールをエクスポート
  return {
    // ユーティリティツール
    validateGitLabConfig,
    getGitLabInfo,

    // リポジトリ操作ツール
    ...repositoryTools,

    // イシュー操作ツール
    ...issueTools,

    // マージリクエスト操作ツール
    ...mergeRequestTools,

    // CI/CD操作ツール
    ...cicdTools,
  };
};

/**
 * Mastra用のGitLab操作ツールを設定・初期化する
 * @param config GitLab API接続設定
 * @returns Mastraで使用可能なGitLab操作ツール
 */
export const setupGitLabTools = (config: { host: string; token: string }) => {
  // 設定値を検証
  const validationResult = gitlabClientConfigSchema.safeParse(config);
  if (!validationResult.success) {
    throw new Error(`GitLab設定が不正です: ${validationResult.error.message}`);
  }

  // GitLab操作ツール一式を作成
  return createGitLabTools(config);
};

// 型定義とクライアントをエクスポート
export * from './types';
export { GitLabClient, createGitLabClient, gitlabClientConfigSchema };
