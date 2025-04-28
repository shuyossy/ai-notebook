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
