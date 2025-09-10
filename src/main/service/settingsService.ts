// @ts-ignore
import { ToolsetsInput } from '@mastra/core/agent';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import {
  SettingsSavingStatus,
  SettingsSavingMessage,
  AgentToolStatus,
  Settings,
} from '@/types';
import { InitializeToolsConfig, initializeTools } from '@/mastra/tools';
import { RedmineBaseInfo } from '@/mastra/tools/redmine';
import { initializeMCPClient } from '@/mastra/tools/mcp';
import { OrchestratorRuntimeContext } from '@/mastra/agents/orchestrator';
import { getSourceRepository } from '@/main/repository/sourceRepository';
import { createRuntimeContext } from '@/mastra/lib/agentUtils';
import { getSettingsRepository } from '../repository/settingsRepository';
import { publishEvent } from '@/main/lib/eventPayloadHelper';
import { IpcChannels } from '@/types';

export interface ISettingsService {
  getStatus(): SettingsSavingStatus;
  getToolsets(): ToolsetsInput;
  updateStatus(
    newState: SettingsSavingStatus['state'],
    message?: SettingsSavingMessage,
    tools?: AgentToolStatus,
  ): void;
  removeMessage(messageId: string): void;
  getRuntimeContext(): Promise<RuntimeContext>;
  initializeSettings(): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

export class SettingsService implements ISettingsService {
  // シングルトン変数
  private static instance: SettingsService;

  // ドキュメント関連リポジトリ
  private sourceRepository = getSourceRepository();

  // ユーザ設定関連リポジトリ
  private settingsRepository = getSettingsRepository();

  // シングルトンインスタンスを取得
  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

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
    const runtimeContext =
      await createRuntimeContext<OrchestratorRuntimeContext>();
    runtimeContext.set('toolStatus', this.status.tools);
    const store = await this.settingsRepository.getSettings();
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
        endpoint: store.redmine.endpoint!,
      });
    }
    if (this.status.tools.gitlab) {
      runtimeContext.set('gitlab', {
        endpoint: store.gitlab.endpoint!,
      });
    }
    if (store.systemPrompt.content) {
      runtimeContext.set('additionalSystemPrompt', store.systemPrompt.content);
    }

    return runtimeContext;
  };

  /**
   * 設定を初期化する
   */
  public initializeSettings = async () => {
    try {
      this.initStatus();
      const toolsConfig: InitializeToolsConfig = {};
      const store = await this.settingsRepository.getSettings();
      // ドキュメントツール
      const documentRegisterDir = store.source.registerDir;
      if (documentRegisterDir && documentRegisterDir.trim() !== '') {
        toolsConfig.documentTool = true;
      }
      // Redmineツール
      const redmineApiKey = store.redmine.apiKey;
      const redmineEndpoint = store.redmine.endpoint;
      if (redmineApiKey && redmineEndpoint) {
        toolsConfig.redmineTool = {
          endpoint: redmineEndpoint,
          apiKey: redmineApiKey,
        };
      }
      // GitLabツール
      const gitlabApiKey = store.gitlab.apiKey;
      const gitlabEndpoint = store.gitlab.endpoint;
      if (gitlabApiKey && gitlabEndpoint) {
        toolsConfig.gitlabTool = {
          endpoint: gitlabEndpoint,
          apiKey: gitlabApiKey,
        };
      }
      // MCP設定
      const mcpConfig = store.mcp.serverConfig;
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
            content: `MCPサーバとの接続に失敗しました\\nログについては${mcpResult.logPath}をご確認ください`,
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
            content: `ドキュメント検索ツールの初期化に失敗しました\\n${documentTool.error}`,
          });
        }
        if (redmineTool && redmineTool?.success === true) {
          this.redmineBaseInfo = redmineTool.redmineInfo;
          this.status.tools.redmine = true;
        } else if (redmineTool?.error) {
          this.status.messages.push({
            id: uuid(),
            type: 'error',
            content: `Redmine操作ツールの初期化に失敗しました\\n${redmineTool.error}`,
          });
        }
        if (gitlabTool && gitlabTool?.success === true) {
          this.status.tools.gitlab = true;
        } else if (gitlabTool?.error) {
          this.status.messages.push({
            id: uuid(),
            type: 'error',
            content: `GitLab操作ツールの初期化に失敗しました\\n${gitlabTool.error}`,
          });
        }
        this.toolsets.aikataOriginalTools = toolsInput;
      }
      // 初期化完了状態に更新
      this.status.state = 'done';
      
      // 設定更新完了イベントを発行（成功）
      publishEvent(IpcChannels.SETTINGS_UPDATE_FINISHED, { success: true });
    } catch (error) {
      // 設定更新完了イベントを発行（失敗）
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
      publishEvent(IpcChannels.SETTINGS_UPDATE_FINISHED, { success: false, error: errorMessage });
      
      // エラーを再throw
      throw error;
    }
  }
  /**
   * 設定を取得する
   */
  public getSettings = async (): Promise<Settings> => {
    return await this.settingsRepository.getSettings();
  };

  /**
   * 設定を保存する
   */
  public saveSettings = async (settings: Settings): Promise<void> => {
    await this.settingsRepository.saveSettings(settings);
  };
}
