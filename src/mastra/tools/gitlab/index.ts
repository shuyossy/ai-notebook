/**
 * GitLab操作ツールのメインファイル
 * GitLabクライアントとGitLab操作用のツール群を提供
 */
import {
  GitLabClient,
  createGitLabClient,
  gitlabClientConfigSchema,
} from './gitlabClient';
import { createRepositoryTools } from './repositoryTools';
import { createMergeRequestTools } from './mergeRequestTools';

/**
 * GitLab操作ツール一式を作成する
 * @param config GitLab APIクライアント設定
 * @returns GitLab操作ツール一式
 */
export const createGitLabTools = (config: { host: string; token: string }) => {
  const client = createGitLabClient(config);

  // 各ツールグループを作成
  const repositoryTools = createRepositoryTools(client);
  const mergeRequestTools = createMergeRequestTools(client);

  // すべてのツールをエクスポート
  return {
    // リポジトリ操作ツール
    ...repositoryTools,

    // マージリクエスト操作ツール
    ...mergeRequestTools,
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

export { GitLabClient, createGitLabClient, gitlabClientConfigSchema };
