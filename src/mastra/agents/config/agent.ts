import { Agent } from '@mastra/core/agent';
import { getStore } from '../../../main/store';
import openAICompatibleModel from '../model/openAICompatible';
import { MemoryConfig, createMemory } from './memory';

// エージェント設定のinterface
export interface AgentConfig {
  name: string;
  instructions: string;
  tools: Record<string, any>;
  memoryConfig?: MemoryConfig;
}

// エージェントの状態管理
class AgentManager {
  private static instances: Map<string, Agent> = new Map();

  static getInstance(name: string): Agent | undefined {
    return this.instances.get(name);
  }

  static setInstance(name: string, agent: Agent): void {
    this.instances.set(name, agent);
  }

  static hasInstance(name: string): boolean {
    return this.instances.has(name);
  }

  static removeInstance(name: string): void {
    this.instances.delete(name);
  }
}

export { AgentManager };

// エージェントインスタンスの生成
export const createAgent = (config: AgentConfig): Agent => {
  // APIキーの取得と検証
  const store = getStore();
  const apiKey = store.get('api.key');
  if (!apiKey) {
    throw new Error('APIキーが設定されていません。');
  }

  return new Agent({
    name: config.name,
    instructions: config.instructions,
    tools: config.tools,
    model: openAICompatibleModel(),
    memory: createMemory(config.memoryConfig),
  });
};
