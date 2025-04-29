import { Agent } from '@mastra/core/agent';
import { MCPConfiguration } from '@mastra/mcp';
import { v4 as uuid } from 'uuid';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts';
import { sourceListTool, querySourceTool } from '../tools/sourcesTools';
import { createAgent } from './config/agent';
import { getStore } from '../../main/store';
import { setupRedmineTools } from '../tools/redmine';
import { McpSchema } from '../../main/types/schema';

const ORCHESTRATOR_NAME = 'orchestrator';

/**
 * オーケストレーターエージェントを取得または作成する
 */
export const getOrchestrator = async (): Promise<Agent> => {
  try {
    // Redinmeツールの登録
    // APIキーとエンドポイントが登録されていた場合は登録する
    const store = getStore();
    const apiKey = store.get('redmine.apiKey') as string;
    const apiUrl = store.get('redmine.endpoint') as string;
    let redmineTools = {};
    if (apiKey && apiUrl) {
      try {
        // Redmineクライアントの初期化
        redmineTools = setupRedmineTools({ apiKey, apiUrl });
        console.log('Redmineクライアントの初期化に成功しました。');
      } catch (error) {
        console.error('Redmineクライアントの初期化に失敗:', error);
      }
    } else {
      console.warn(
        'Redmine APIキーまたはエンドポイントが設定されていません。Redmineツールは登録されません。',
      );
    }

    // MCP設定の取得
    const mcpServers = store.get('mcpServers');
    let mcpTools = {};

    // MCPツールの登録
    if (Object.keys(mcpServers).length > 0) {
      try {
        const validatedConfig = McpSchema.parse(mcpServers);
        const mcp = new MCPConfiguration({
          id: uuid(),
          servers: validatedConfig,
        });
        mcpTools = await mcp.getTools();
        console.log('MCPサーバーの初期化に成功しました。');
      } catch (error) {
        console.error(
          'MCPサーバー設定の検証またはツールの取得に失敗しました:',
          error,
        );
      }
    }

    // エージェントの作成
    const agent = createAgent({
      name: ORCHESTRATOR_NAME,
      instructions: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: {
        sourceListTool,
        querySourceTool,
        ...redmineTools,
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

    return agent;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : '不明なエラー';
    throw new Error(
      `オーケストレーターエージェントの初期化に失敗しました: ${errorMessage}`,
    );
  }
};

export default getOrchestrator;
