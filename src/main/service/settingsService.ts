// @ts-ignore
import { ToolsetsInput } from '@mastra/core/agent';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { McpSchema } from '@/types';
import {
  SettingsSavingStatus,
  SettingsSavingMessage,
  AgentToolStatus,
} from '@/types';
import { getStore } from '../store';
import { InitializeToolsConfig, initializeTools } from '@/mastra/tools';
import { RedmineBaseInfo } from '@/mastra/tools/redmine';
import { initializeMCPClient } from '@/mastra/tools/mcp';
import { OrchestratorRuntimeContext } from '@/mastra/agents/orchestrator';
import { getSourceRepository } from '@/db/repository/sourceRepository';
import { createRuntimeContext } from '@/mastra/agents/lib';

export class SettingsService {
  private sourceRepository = getSourceRepository();

  // 設定状態
  private status: SettingsSavingStatus = {
    state: 'saving',
    messages: [],
    tools: {
      document: false,
      redmine: false,
      gitlab: false,
      mcp: false,
    },
  };

  // 利用可能なツール
  private toolsets: ToolsetsInput = {};

  // Redmine基本情報
  // webアプリ化した場合、ユーザごとにRedmine基本情報を保持するのはデータ効率悪いので、DSSのみに接続できるようにした方が良いか
  private redmineBaseInfo: RedmineBaseInfo | undefined;

  /**
   * 設定状態を取得する
   */
  public getStatus = (): SettingsSavingStatus => {
    return this.status;
  };

  /**
   * 利用可能なツールセットを取得する
   */
  public getToolsets = (): ToolsetsInput => {
    return this.toolsets;
  };

  /**
   * 設定保存状態を変更する
   */
  public updateStatus = (
    newState: SettingsSavingStatus['state'],
    message?: SettingsSavingMessage,
    tools?: AgentToolStatus,
  ) => {
    this.status.state = newState;

    if (message) {
      const newMessage: SettingsSavingMessage = {
        id: crypto.randomUUID(),
        type: message.type,
        content: message.content,
      };
      this.status.messages?.push(newMessage);
    }

    if (tools) {
      this.status.tools = tools;
    }
  };

  public initStatus = () => {
    this.status.state = 'saving';
    this.status.messages = [];
    this.status.tools = {
      document: false,
      redmine: false,
      gitlab: false,
      mcp: false,
    };
  };

  /**
   * メッセージIDを指定して削除する
   */
  public removeMessage = (messageId: string) => {
    this.status.messages = this.status.messages?.filter(
      (msg) => msg.id !== messageId,
    );
  };

  /**
   * OrchestratorのRuntimeContextを取得する
   * @returns OrchestratorRuntimeContext
   */
  public getRuntimeContext = async (): Promise<RuntimeContext> => {
    const runtimeContext = createRuntimeContext<OrchestratorRuntimeContext>();
    runtimeContext.set('toolStatus', this.status.tools);
    const store = getStore();
    if (this.status.tools.document) {
      const sourceListMarkdown =
        await this.sourceRepository.getSourceListMarkdown();
      if (sourceListMarkdown) {
        runtimeContext.set('documentQuery', {
          registeredDocuments: sourceListMarkdown,
        });
      }
    }
    if (this.status.tools.redmine && this.redmineBaseInfo) {
      runtimeContext.set('redmine', {
        basicInfo: this.redmineBaseInfo,
        endpoint: store.get('redmine').endpoint,
      });
    }
    if (this.status.tools.gitlab) {
      runtimeContext.set('gitlab', {
        endpoint: store.get('gitlab').endpoint,
      });
    }
    if (store.get('systemPrompt').content) {
      runtimeContext.set(
        'additionalSystemPrompt',
        store.get('systemPrompt').content,
      );
    }

    return runtimeContext;
  };

  /**
   * 設定を初期化する
   */
  public initializeSettings = async () => {
    try {
      this.initStatus();
      const store = getStore();
      const toolsConfig: InitializeToolsConfig = {};
      let mcpConfig: z.infer<typeof McpSchema> | null = null;
      // ドキュメントツール
      const documentRegisterDir = store.get('source').registerDir;
      if (documentRegisterDir && documentRegisterDir.trim() !== '') {
        toolsConfig.documentTool = true;
      }
      // Redmineツール
      const redmineApiKey = store.get('redmine').apiKey;
      const redmineEndpoint = store.get('redmine').endpoint;
      if (redmineApiKey && redmineEndpoint) {
        toolsConfig.redmineTool = {
          endpoint: redmineEndpoint,
          apiKey: redmineApiKey,
        };
      }
      // GitLabツール
      const gitlabApiKey = store.get('gitlab').apiKey;
      const gitlabEndpoint = store.get('gitlab').endpoint;
      if (gitlabApiKey && gitlabEndpoint) {
        toolsConfig.gitlabTool = {
          endpoint: gitlabEndpoint,
          apiKey: gitlabApiKey,
        };
      }
      // MCP設定
      const mcpConfigText = store.get('mcp').serverConfigText;
      if (mcpConfigText && mcpConfigText.trim() !== '{}') {
        try {
          const parsedConfig = JSON.parse(mcpConfigText);
          const validatedConfig = McpSchema.parse(parsedConfig);
          mcpConfig = validatedConfig;
        } catch (error) {
          console.error('MCP設定のパースに失敗しました:', error);
          this.status.messages.push({
            id: uuid(),
            type: 'error',
            content: `MCP設定が不正な形式です\n設定を確認してください`,
          });
        }
      }
      // Mastra MCPの初期化
      if (mcpConfig) {
        const mcpResult = await initializeMCPClient({ mcpConfig, id: 'user' });
        if (mcpResult.success && mcpResult.mcpClient) {
          this.status.tools.mcp = true;
          this.toolsets = await mcpResult.mcpClient.getToolsets();
        } else {
          this.status.messages.push({
            id: crypto.randomUUID(),
            type: 'error',
            content: `MCPサーバとの接続に失敗しました\nログについては${mcpResult.logPath}をご確認ください`,
          });
        }
      }
      // Mastra toolの初期化
      if (
        toolsConfig.documentTool ||
        toolsConfig.redmineTool ||
        toolsConfig.gitlabTool
      ) {
        const { documentTool, redmineTool, gitlabTool, toolsInput } =
          await initializeTools(toolsConfig);
        if (documentTool && documentTool?.success === true) {
          this.status.tools.document = true;
        } else if (documentTool?.error) {
          this.status.messages.push({
            id: uuid(),
            type: 'error',
            content: `ドキュメント検索ツールの初期化に失敗しました\n設定を確認してください\n${documentTool.error}`,
          });
        }
        if (redmineTool && redmineTool?.success === true) {
          this.redmineBaseInfo = redmineTool.redmineInfo;
          this.status.tools.redmine = true;
        } else if (redmineTool?.error) {
          this.status.messages.push({
            id: uuid(),
            type: 'error',
            content: `Redmine操作ツールの初期化に失敗しました\n設定を確認してください\n${redmineTool.error}`,
          });
        }
        if (gitlabTool && gitlabTool?.success === true) {
          this.status.tools.gitlab = true;
        } else if (gitlabTool?.error) {
          this.status.messages.push({
            id: uuid(),
            type: 'error',
            content: `GitLab操作ツールの初期化に失敗しました\n設定を確認してください\n${gitlabTool.error}`,
          });
        }
        this.toolsets.aikataOriginalTools = toolsInput;
      }
    } catch (error) {
      console.error('設定の初期化に失敗しました:', error);
      this.status.state = 'error';
      this.status.messages.push({
        id: uuid(),
        type: 'error',
        content: `設定の初期化中にエラーが発生しました: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      });
    }
    // 初期化完了状態に更新
    this.status.state = 'done';
  };
}
