import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getStore } from '../../../main/store';
import openAICompatibleModel from '../model/openAICompatible';

// エージェント設定のスキーマ
export const AgentConfigSchema = z.object({
  name: z.string(),
  instructions: z.string(),
  tools: z.record(z.any()),
  memoryConfig: z
    .object({
      lastMessages: z.number().optional(),
      semanticRecall: z.boolean().optional(),
    })
    .optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

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
  try {
    // 設定のバリデーション
    AgentConfigSchema.parse(config);

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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`エージェント設定が不正です: ${error.message}`);
    }
    throw error;
  }
};
