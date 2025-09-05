// @ts-ignore
import { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import { McpSchema } from '@/types';
import { documentQueryTool } from './sourcesTools';
import type { RedmineBaseInfo } from './redmine/types';
import { createRedmineClient, setupRedmineTools } from './redmine';
import { setupGitLabTools } from './gitlab';

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
    } catch (error) {
      result.documentTool = {
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
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

      // 基本情報の取得
      const redmineInfo = await client.getBaseInfo();
      // 作成したクライアントを使ってツールを初期化
      const redmineTools = await setupRedmineTools(client);
      tools = { ...tools, ...redmineTools };
      result.redmineTool = { success: true, redmineInfo };
    } catch (error) {
      result.redmineTool = {
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
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
    } catch (error) {
      result.gitlabTool = {
        success: false,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      };
    }
  }
  result.toolsInput = tools;
  return result;
};
