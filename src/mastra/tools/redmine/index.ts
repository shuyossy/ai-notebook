/**
 * Redmine操作ツールのメインファイル
 * RedmineクライアントとRedmine操作用のツール群を提供
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  RedmineClient,
  createRedmineClient,
  redmineClientConfigSchema,
} from './redmineClient';
import { createIssueTools } from './issueTools';
import { createTimeEntryTools } from './timeEntryTools';
import { createWikiTools } from './wikiTools';

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
  const timeEntryTools = createTimeEntryTools(client);
  const wikiTools = createWikiTools(client);

  // Redmineクライアント設定を検証するツール
  const validateRedmineConfig = createTool({
    id: 'redmine-validate-config',
    description: 'Redmine API接続設定を検証します。',
    inputSchema: z.object({}),
    outputSchema: z.object({
      valid: z.boolean(),
      message: z.string(),
      projects: z
        .array(
          z.object({
            id: z.number(),
            name: z.string(),
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
          message: 'Redmine API接続が正常に確立されました。',
          projects,
        };
      } catch (error) {
        let errorMessage = 'Redmine API接続に失敗しました。';
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

  // Redmine API情報を取得するツール
  const getRedmineInfo = createTool({
    id: 'redmine-get-info',
    description:
      'Redmineインスタンスの基本情報（プロジェクト、ユーザー、トラッカー、ステータスなど）を取得します。',
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
      const [projects, trackers, statuses, priorities, activities] =
        await Promise.all([
          client.getProjects(),
          client.getTrackers(),
          client.getStatuses(),
          client.getPriorities(),
          client.getTimeEntryActivities(),
        ]);

      return {
        projects,
        trackers,
        statuses,
        priorities,
        activities,
      };
    },
  });

  // すべてのツールをエクスポート
  return {
    // ユーティリティツール
    validateRedmineConfig,
    getRedmineInfo,

    // チケット操作ツール
    ...issueTools,

    // タイムエントリーツール
    ...timeEntryTools,

    // Wikiツール
    ...wikiTools,
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
  // 設定値を検証
  const validationResult = redmineClientConfigSchema.safeParse(config);
  if (!validationResult.success) {
    throw new Error(`Redmine設定が不正です: ${validationResult.error.message}`);
  }

  // Redmine操作ツール一式を作成
  return createRedmineTools(config);
};

// 型定義とクライアントをエクスポート
export * from './types';
export { RedmineClient, createRedmineClient, redmineClientConfigSchema };
