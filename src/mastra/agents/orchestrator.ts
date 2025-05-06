import { Agent } from '@mastra/core/agent';
import { MCPConfiguration, LogMessage } from '@mastra/mcp';
import { v4 as uuid } from 'uuid';
import { writeFileSync } from 'fs';
import { querySourceTool } from '../tools/sourcesTools';
import { createAgent } from './config/agent';
import { getStore } from '../../main/store';
import { setupRedmineTools } from '../tools/redmine';
import { setupGitLabTools } from '../tools/gitlab';
import { McpSchema } from '../../main/types/schema';
import { AgentBootMessage } from '../../main/types';

const ORCHESTRATOR_NAME = 'orchestrator';
const LOG_FILE_PATH = './mcp.log';

/**
 * ログメッセージをフォーマットする
 */
const formatLogMessage = (logMessage: LogMessage): string => {
  const timestamp = logMessage.timestamp
    .toISOString()
    .replace('T', ' ')
    .split('.')[0];
  const details = logMessage.details ? JSON.stringify(logMessage.details) : '';
  return `[${timestamp}] [${logMessage.level}] ${logMessage.message} ${details}`.trim();
};

/**
 * ログをファイルに書き込む
 */
const writeLog = (logMessage: LogMessage): void => {
  try {
    const formattedLog = formatLogMessage(logMessage);
    writeFileSync(LOG_FILE_PATH, `${formattedLog}\n`, { flag: 'a' });
  } catch (error) {
    console.error('ログファイルの書き込みに失敗しました:', error);
  }
};

/**
 * ログファイルを削除する
 */
const deleteLogFile = (): void => {
  try {
    writeFileSync(LOG_FILE_PATH, '', { flag: 'w' });
  } catch (error) {
    console.error('ログファイルの削除に失敗しました:', error);
  }
};

/**
 * オーケストレーターエージェントを取得または作成する
 */
export const getOrchestrator = async (): Promise<{
  agent: Agent;
  alertMessages: AgentBootMessage[];
  toolStatus: {
    redmine: boolean;
    gitlab: boolean;
    mcp: boolean;
  };
}> => {
  const alertMessages: AgentBootMessage[] = [];
  let agent: Agent | null = null;
  let redmineTools = {};
  let gitlabTools = {};
  let mcpTools = {};

  try {
    const store = getStore();

    // Redinmeツールの登録
    // APIキーとエンドポイントが登録されていた場合は登録する
    const redmineApiKey = store.get('redmine').apiKey;
    const redmineEndpoint = store.get('redmine').endpoint;
    if (redmineApiKey && redmineEndpoint) {
      try {
        // Redmineクライアントの初期化
        redmineTools = await setupRedmineTools({
          apiKey: redmineApiKey,
          apiUrl: redmineEndpoint,
        });
        alertMessages.push({
          id: uuid(),
          type: 'info',
          content: 'Redmineクライアントの初期化に成功しました。',
        });
      } catch (error) {
        alertMessages.push({
          id: uuid(),
          type: 'warning',
          content: `Redmineクライアントの初期化に失敗しました\n設定を確認してください\n${error}`,
        });
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
    if (gitlabApiKey && gitlabEndpoint) {
      try {
        // Gitlabクライアントの初期化
        gitlabTools = await setupGitLabTools({
          token: gitlabApiKey,
          host: gitlabEndpoint,
        });
        alertMessages.push({
          id: uuid(),
          type: 'info',
          content: 'Gitlabクライアントの初期化に成功しました。',
        });
      } catch (error) {
        alertMessages.push({
          id: uuid(),
          type: 'warning',
          content: `Gitlabクライアントの初期化に失敗しました\n設定を確認してください\n${error}`,
        });
      }
    } else {
      console.warn(
        'Gitlab APIキーまたはエンドポイントが設定されていません。Gitlabツールは登録されません。',
      );
    }

    // MCP設定の取得
    const mcpConfig = store.get('mcp');

    // MCPツールの登録
    if (mcpConfig?.serverConfigText && mcpConfig.serverConfigText !== '{}') {
      deleteLogFile();
      try {
        const parsedConfig = JSON.parse(mcpConfig.serverConfigText);
        const validatedConfig = McpSchema.parse(parsedConfig);
        // それぞれのサーバ設定にログを設定
        const validatedConfigWithLoggerOption = Object.fromEntries(
          Object.entries(validatedConfig).map(([key, value]) => [
            key,
            {
              ...value,
              logger: writeLog,
            },
          ]),
        );
        const mcp = new MCPConfiguration({
          id: uuid(),
          servers: validatedConfigWithLoggerOption,
        });
        mcpTools = await mcp.getTools();
        alertMessages.push({
          id: uuid(),
          type: 'info',
          content: 'MCPサーバーの初期化に成功しました。',
        });
      } catch (error) {
        alertMessages.push({
          id: uuid(),
          type: 'warning',
          content: `MCPサーバーとの接続に失敗しました\nログについては${LOG_FILE_PATH}をご確認ください`,
        });
        console.error('MCPサーバーの初期化に失敗しました:', error);
      }
    }

    // エージェントの作成
    agent = createAgent({
      name: ORCHESTRATOR_NAME,
      instructions: '', // 空の指示を設定（streamメソッド時に動的に設定するため）
      tools: {
        // sourceListTool,
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
    toolStatus: {
      redmine: !!redmineTools && Object.keys(redmineTools).length > 0,
      gitlab: !!gitlabTools && Object.keys(gitlabTools).length > 0,
      mcp: !!mcpTools && Object.keys(mcpTools).length > 0,
    },
  };
};

export default getOrchestrator;
