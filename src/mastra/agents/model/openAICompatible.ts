import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import type { BaseRuntimeContext } from '../types';
import { internalError } from '@/main/lib/error';

export const getOpenAICompatibleModel = ({
  runtimeContext,
}: {
  runtimeContext: RuntimeContext<BaseRuntimeContext>;
}) => {
  const apiConfig = runtimeContext.get('model');
  if (!apiConfig || !apiConfig.key || !apiConfig.url || !apiConfig.modelName) {
    throw internalError({
      expose: true,
      messageCode: 'VALIDATION_ERROR',
      messageParams: {
        detail:
          'AI APIの設定が正しくありません。APIキー、URL、BPR IDを確認してください。',
      },
    });
  }

  const model = createOpenAICompatible({
    name: 'openAICompatibleModel',
    apiKey: apiConfig.key,
    baseURL: apiConfig.url,
  }).chatModel(apiConfig.modelName);
  return model;
};
