/**
 * Redmine操作ツールのメインファイル
 * RedmineクライアントとRedmine操作用のツール群を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RedmineClient, createRedmineClient } from './redmineClient';
import { RedmineSchema } from '../../../main/types/settingsSchema';
import { createIssueTools } from './issueTools';

/**
 * Redmine操作ツール一式を作成する
 * @param config Redmine APIクライアント設定
 * @returns Redmine操作ツール一式
 */
export const createRedmineTools = (config: {
  apiUrl: string;
  apiKey: string;
}) => {
  const client = createRedmineClient(config);

  // 各ツールグループを作成
  const issueTools = createIssueTools(client);

  // Redmine API情報を取得するツール
  const getRedmineInfo = createTool({
    id: 'redmine-get-info',
    description:
      'Redmineインスタンスの基本情報（プロジェクト、トラッカー、ステータス、優先度など）を取得します。',
    inputSchema: z.object({}),
    outputSchema: z.object({
      projects: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
        }),
      ),
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
      const [projects, trackers, statuses, priorities] = await Promise.all([
        client.getProjects(),
        client.getTrackers(),
        client.getStatuses(),
        client.getPriorities(),
      ]);

      return {
        projects,
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
 * @param config Redmine API接続設定
 * @returns Mastraで使用可能なRedmine操作ツール
 */
export const setupRedmineTools = (config: {
  apiUrl: string;
  apiKey: string;
}) => {
  return (async () => {
    // settingsSchemaによる設定値の検証
    const validationResult = RedmineSchema.safeParse({
      endpoint: config.apiUrl,
      apiKey: config.apiKey,
    });
    if (!validationResult.success) {
      throw new Error(
        `Redmine設定が不正です: ${validationResult.error.message}`,
      );
    }

    // Redmineクライアントを作成
    const client = createRedmineClient(config);

    // API疎通確認
    try {
      await client.testConnection();
      // eslint-disable-next-line
    } catch (error: any) {
      throw new Error(`Redmine APIへの接続確認に失敗しました`);
    }

    // Redmine操作ツール一式を作成
    return createRedmineTools(config);
  })();
};

// 型定義とクライアントをエクスポート
export * from './types';
export { RedmineClient, createRedmineClient };
