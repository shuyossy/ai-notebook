import { Agent } from '@mastra/core/agent';
import { MCPConfiguration } from '@mastra/mcp';
import { v4 as uuid } from 'uuid';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts';
import { sourceListTool, querySourceTool } from '../tools/sourcesTools';
import { createAgent } from './config/agent';
import { getStore } from '../../main/store';
import { setupRedmineTools } from '../tools/redmine';
import { setupGitLabTools } from '../tools/gitlab';
import { McpSchema } from '../../main/types/schema';
import { AgentBootMessage } from '../../main/types';

const ORCHESTRATOR_NAME = 'orchestrator';

/**
 * オーケストレーターエージェントを取得または作成する
 */
export const getOrchestrator = async (): Promise<{
  agent: Agent;
  alertMessages: AgentBootMessage[];
}> => {
  const alertMessages: AgentBootMessage[] = [];
  let agent: Agent | null = null;
  try {
    // Redinmeツールの登録
    // APIキーとエンドポイントが登録されていた場合は登録する
    const store = getStore();
    const redmineApiKey = store.get('redmine').apiKey;
    const redmineEndpoint = store.get('redmine').endpoint;
    let redmineTools = {};
    if (redmineApiKey && redmineEndpoint) {
      try {
        // Redmineクライアントの初期化
        redmineTools = setupRedmineTools({
          apiKey: redmineApiKey,
          apiUrl: redmineEndpoint,
        });
        console.log('Redmineクライアントの初期化に成功しました。');
      } catch (error) {
        alertMessages.push({
          id: uuid(),
          type: 'warning',
          content: `Redmineクライアントの初期化に失敗しました\n設定を確認してください`,
        });
        console.error('Redmineクライアントの初期化に失敗しました:', error);
      }
    } else {
      console.warn(
        'Redmine APIキーまたはエンドポイントが設定されていません。Redmineツールは登録されません。',
      );
    }

    // Gitlabツールの登録
    // GitlabのAPIキーとエンドポイントが登録されていた場合は登録する
    const gitlabStore = store.get('gitlab');
    const gitlabApiKey = gitlabStore.apiKey;
    const gitlabEndpoint = gitlabStore.endpoint;
    let gitlabTools = {};
    if (gitlabApiKey && gitlabEndpoint) {
      try {
        // Gitlabクライアントの初期化
        gitlabTools = setupGitLabTools({
          token: gitlabApiKey,
          host: gitlabEndpoint,
        });
        console.log('Gitlabクライアントの初期化に成功しました。');
      } catch (error) {
        alertMessages.push({
          id: uuid(),
          type: 'warning',
          content: `Gitlabクライアントの初期化に失敗しました\n設定を確認してください`,
        });
        console.error('Gitlabクライアントの初期化に失敗しました:', error);
      }
    } else {
      console.warn(
        'Gitlab APIキーまたはエンドポイントが設定されていません。Gitlabツールは登録されません。',
      );
    }

    // MCP設定の取得
    const mcpConfig = store.get('mcp');
    let mcpTools = {};

    // MCPツールの登録
    if (mcpConfig?.serverConfigText && mcpConfig.serverConfigText !== '{}') {
      try {
        const parsedConfig = JSON.parse(mcpConfig.serverConfigText);
        const validatedConfig = McpSchema.parse(parsedConfig);
        const mcp = new MCPConfiguration({
          id: uuid(),
          servers: validatedConfig,
        });
        mcpTools = await mcp.getTools();
        console.log('MCPサーバーの初期化に成功しました。');
      } catch (error) {
        alertMessages.push({
          id: uuid(),
          type: 'warning',
          content: `MCPサーバーとの接続に失敗しました\nログについては./mcp.logをご確認ください`,
        });
        console.error('MCPサーバーの初期化に失敗しました:', error);
      }
    }

    // エージェントの作成
    agent = createAgent({
      name: ORCHESTRATOR_NAME,
      instructions: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: {
        sourceListTool,
        querySourceTool,
        ...redmineTools,
        ...gitlabTools,
        ...mcpTools,
      },
      memoryConfig: {
        lastMessages: 40,
        semanticRecall: false,
        threads: {
          generateTitle: true,
        },
        workingMemory: {
          enabled: true,
          use: 'tool-call',
          tmplate: `
# スレッド全体の内容

- 要約：
- トピック：
  - [トピック 1]
  - [トピック 2]
- メモ
  - [メモ 1]
  - [メモ 2]

# 現在対応中の質問内容

- 質問内容:
- キーワード
  - [キーワード 1]: [キーワード 1の内容]
  - [キーワード 2]: [キーワード 2の内容]

## 対応手順
- [ステップ 1]: [ステップ 1の内容]
- [ステップ 2]: [ステップ 2の内容]

## 作業メモ

- [メモ 1]
- [メモ 2]

## 回答メモ

- [メモ 1]
- [メモ 2]
`,
        },
      },
    });
  } catch (error) {
    alertMessages.push({
      id: uuid(),
      type: 'error',
      content: `AIエージェントの初期化に失敗しました\nAIエージェントを再起動するにはアプリを再起動してください:\n ${error}`,
    });
    throw error;
  }
  return {
    agent,
    alertMessages,
  };
};

export default getOrchestrator;
