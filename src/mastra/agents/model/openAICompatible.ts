import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { RuntimeContext } from '@mastra/core/runtime-context';
import type { BaseRuntimeContext } from '../types';

export const getOpenAICompatibleModel = ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<BaseRuntimeContext>;
}) => {
  const apiConfig = runtimeContext.get('model');
  if (!apiConfig || !apiConfig.key || !apiConfig.url || !apiConfig.modelName) {
    throw new Error(
      'AI APIの設定が正しくありません。APIキー、URL、BPR IDを確認してください。',
    );
  }

  const model = createOpenAICompatible({
    name: 'openAICompatibleModel',
    apiKey: apiConfig.key,
    baseURL: apiConfig.url,
  }).chatModel(apiConfig.modelName);
  return model;
};
