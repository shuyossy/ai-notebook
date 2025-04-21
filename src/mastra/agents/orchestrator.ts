import { Agent } from '@mastra/core/agent';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts';
import { sourceListTool, querySourceTool } from '../tools/sourcesTools';
import { AgentManager, createAgent } from './config/agent';

const ORCHESTRATOR_NAME = 'orchestrator';

/**
 * オーケストレーターエージェントを取得または作成する
 * シングルトンパターンで管理し、必要に応じて初期化する
 */
export const getOrchestrator = (): Agent => {
  try {
    // 既存のインスタンスがあれば返す
    const existingAgent = AgentManager.getInstance(ORCHESTRATOR_NAME);
    if (existingAgent) {
      return existingAgent;
    }

    // 新規インスタンスを作成
    const agent = createAgent({
      name: ORCHESTRATOR_NAME,
      instructions: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: {
        sourceListTool,
        querySourceTool,
      },
      memoryConfig: {
        lastMessages: 40,
        semanticRecall: false,
      },
    });

    // インスタンスを保存
    AgentManager.setInstance(ORCHESTRATOR_NAME, agent);

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
