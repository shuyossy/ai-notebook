import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/core/storage/libsql';
import { URL } from 'url';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts';
import openAICompatibleModel from './model/openAICompatible';
import { sourceListTool, querySourceTool } from '../tools/sourcesTools';
import { getStore } from '../../main/store';

let orchestratorInstance: Agent;

export const getOrchestrator = () => {
  if (!orchestratorInstance) {
    const store = getStore();

    const memory = new Memory({
      options: {
        lastMessages: 40,
        semanticRecall: false,
      },
      storage: new LibSQLStore({
        config: {
          url: new URL('memory.db', store.get('database.dir')).href,
        },
      }),
    });

    orchestratorInstance = new Agent({
      name: 'orchestrator',
      instructions: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: {
        sourceListTool,
        querySourceTool,
      },
      model: openAICompatibleModel(),
      memory,
    });
  }
  return orchestratorInstance;
};

export default getOrchestrator;
