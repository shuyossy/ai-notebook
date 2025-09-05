// toolで利用するエージェントをまとめたクラス
// @ts-ignore
import { Agent } from '@mastra/core/agent';
import { getOpenAICompatibleModel } from './model/openAICompatible';
// eslint-disable-next-line import/no-cycle
import { getDocumentQuerySystemPrompt } from './prompts';
import { BaseRuntimeContext } from './types';

export type DocumentExpertAgentRuntimeContext = BaseRuntimeContext & {
  documentContent: string;
};

export const documentExpertAgent = new Agent({
  name: 'documentExpertAgent',
  instructions: getDocumentQuerySystemPrompt,
  model: getOpenAICompatibleModel,
});
