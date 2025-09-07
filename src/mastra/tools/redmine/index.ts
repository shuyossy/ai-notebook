/**
 * Redmine操作ツールのメインファイル
 * RedmineクライアントとRedmine操作用のツール群を提供
 */

// @ts-ignore
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  RedmineClient,
  RedmineClientConfig,
  createRedmineClient,
} from './redmineClient';
import { createIssueTools } from './issueTools';

/**
 * Redmine操作ツール一式を作成する
 * @param config Redmine APIクライアント設定
 * @returns Redmine操作ツール一式
 */
export const createRedmineTools = (client: RedmineClient) => {
  // 各ツールグループを作成
  const issueTools = createIssueTools(client);

  // Redmine API情報を取得するツール
  const getRedmineInfo = createTool({
    id: 'redmine-get-info',
    description:
      'Redmineインスタンスの基本情報（プロジェクト、トラッカー、ステータス、優先度など）を取得します。',
    inputSchema: z.object({}),
    outputSchema: z.object({
      trackers: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
        }),
      ),
      statuses: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
        }),
      ),
      priorities: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
        }),
      ),
    }),
    execute: async () => {
      // 各種マスタ情報を取得
      const [trackers, statuses, priorities] = await Promise.all([
        client.getTrackers(),
        client.getStatuses(),
        client.getPriorities(),
      ]);

      return {
        trackers,
        statuses,
        priorities,
      };
    },
  });

  // すべてのツールをエクスポート
  return {
    // ユーティリティツール
    getRedmineInfo,

    // チケット操作ツール
    ...issueTools,
  };
};

/**
 * Mastra用のRedmine操作ツールを設定・初期化する
 * @param config Redmine API接続設定、またはRedmineClientインスタンス
 * @returns Mastraで使用可能なRedmine操作ツール
 */
export const setupRedmineTools = async (
  config: RedmineClientConfig | RedmineClient,
): Promise<ReturnType<typeof createRedmineTools>> => {
  let client: RedmineClient;

  if (config instanceof RedmineClient) {
    client = config;
  } else {
    // Redmineクライアントを作成
    client = createRedmineClient(config);
  }

  // API疎通確認
  await client.testConnection();

  // Redmine操作ツール一式を作成
  return createRedmineTools(client);
};

// 型定義とクライアントをエクスポート
export * from './types';
export { RedmineClient, createRedmineClient };
