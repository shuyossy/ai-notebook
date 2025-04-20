import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/core/storage/libsql';
import { URL } from 'url';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts';
import openAICompatibleModel from './model/openAICompatible';
import { sourceListTool, querySourceTool } from '../tools/sourcesTools';

// データベースURLが設定されていなければエラー
if (!process.env.DATABASE_DIR) {
  throw new Error('DATABASE_DIR環境変数が設定されていません');
}

const memory = new Memory({
  options: {
    lastMessages: 40,
    semanticRecall: false,
  },
  storage: new LibSQLStore({
    config: {
      url: new URL('memory.db', process.env.DATABASE_DIR).href,
    },
  }),
});

// AIエージェントを作成
export const orchestrator = new Agent({
  name: 'orchestrator',
  instructions: ORCHESTRATOR_SYSTEM_PROMPT,
  tools: {
    sourceListTool,
    querySourceTool,
  },
  model: openAICompatibleModel,
  memory,
});

export default orchestrator;
