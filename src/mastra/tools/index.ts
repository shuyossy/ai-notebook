// @ts-ignore
import { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import { McpSchema } from '@/types';
import { documentQueryTool } from './sourcesTools';
import type { RedmineBaseInfo } from './redmine/types';
import { createRedmineClient, setupRedmineTools } from './redmine';
import { setupGitLabTools } from './gitlab';
import { getMainLogger } from '@/main/lib/logger';
import { normalizeUnknownError } from '@/main/lib/error';

export type InitializeToolsConfig = {
  documentTool?: boolean;
  redmineTool?: {
    endpoint: string;
    apiKey: string;
  };
  gitlabTool?: {
    endpoint: string;
    apiKey: string;
  };
  mcp?: {
    config: z.infer<typeof McpSchema>;
    id: string;
  };
};

type InitializeToolsResult = {
  documentTool?: {
    success: boolean;
    error?: string;
  };
  redmineTool?: {
    success: boolean;
    redmineInfo?: RedmineBaseInfo;
    error?: string;
  };
  gitlabTool?: {
    success: boolean;
    error?: string;
  };
  toolsInput: ToolsInput;
};

const logger = getMainLogger();

// ツールを初期化/更新する関数
export const initializeTools = async (
  config: InitializeToolsConfig,
): Promise<InitializeToolsResult> => {
  const result: InitializeToolsResult = { toolsInput: {} };
  let tools: ToolsInput = {};
  if (config.documentTool) {
    try {
      tools.documentQueryTool = documentQueryTool;
      result.documentTool = { success: true };
    } catch (err) {
      logger.error(err, 'ドキュメントツールの初期化に失敗しました');
      const error = normalizeUnknownError(err);
      result.documentTool = {
        success: false,
        error: error.message,
      };
    }
  }
  if (
    config.redmineTool &&
    config.redmineTool.endpoint &&
    config.redmineTool.apiKey
  ) {
    try {
      // Redmineクライアントを作成
      const client = createRedmineClient({
        apiKey: config.redmineTool.apiKey,
        apiUrl: config.redmineTool.endpoint,
      });

      // 作成したクライアントを使ってツールを初期化
      const redmineTools = await setupRedmineTools(client);

      // 基本情報の取得
      const redmineInfo = await client.getBaseInfo();
      tools = { ...tools, ...redmineTools };
      result.redmineTool = { success: true, redmineInfo };
    } catch (err) {
      console.error(err);
      logger.error(err, 'Redmineツールの初期化に失敗しました');
      const error = normalizeUnknownError(err);
      result.redmineTool = {
        success: false,
        error: error.message,
      };
    }
  }
  if (
    config.gitlabTool &&
    config.gitlabTool.endpoint &&
    config.gitlabTool.apiKey
  ) {
    try {
      // GitLabツールの初期化
      const gitlabTools = await setupGitLabTools({
        token: config.gitlabTool.apiKey,
        host: config.gitlabTool.endpoint,
      });
      tools = { ...tools, ...gitlabTools };
      result.gitlabTool = { success: true };
    } catch (err) {
      logger.error(err, 'GitLabツールの初期化に失敗しました');
      const error = normalizeUnknownError(err);
      result.gitlabTool = {
        success: false,
        error: error.message,
      };
    }
  }
  result.toolsInput = tools;
  return result;
};
