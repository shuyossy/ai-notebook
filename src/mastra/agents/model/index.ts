/**
 * AIモデル取得関数
 * モデル名に応じて適切なAIモデルを返す
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI, openai } from '@ai-sdk/openai';
// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import type { BaseRuntimeContext } from '../types';
import { internalError } from '@/main/lib/error';
import { isValidModelName, type ModelName } from '@/config/modelConfig';

/**
 * モデル名に応じてAIモデルを取得する関数
 * 現在はgpt-4o/gpt-5共にOpenAICompatibleModelを返す
 * 将来的に異なるモデルを追加する場合はswitch文で分岐させる
 *
 * @param params runtimeContextを含むパラメータ
 * @returns AIモデルインスタンス
 */
export const getModel = ({
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
          'AI APIの設定が正しくありません。APIキー、URL、モデル名を確認してください。',
      },
    });
  }

  // モデル名の検証
  if (!isValidModelName(apiConfig.modelName)) {
    throw internalError({
      expose: true,
      messageCode: 'VALIDATION_ERROR',
      messageParams: {
        detail: `無効なモデル名です: ${apiConfig.modelName}`,
      },
    });
  }

  const modelName: ModelName = apiConfig.modelName;

  // モデル名に応じてモデルを出し分け
  switch (modelName) {
    case 'gpt-4.1-mini':
      return createOpenAICompatible({
        name: 'openAICompatibleModel_gpt4.1-mini',
        apiKey: apiConfig.key,
        baseURL: apiConfig.url,
      }).chatModel('openai/gpt-4.1-mini');
    case 'gpt-4o':
      return createOpenAICompatible({
        name: 'openAICompatibleModel_gpt4o',
        apiKey: apiConfig.key,
        baseURL: apiConfig.url,
      }).chatModel('openai/gpt-4o');
    case 'gpt-5':
      const openai = createOpenAI({
        name: 'openAI_gpt5',
        apiKey: apiConfig.key,
        baseURL: apiConfig.url,
      });
      return openai('openai/gpt-5');
    default: {
      // TypeScriptによる網羅性チェック
      const _exhaustiveCheck: never = modelName;
      throw internalError({
        expose: true,
        messageCode: 'VALIDATION_ERROR',
        messageParams: {
          detail: `未対応のモデル名です: ${_exhaustiveCheck}`,
        },
      });
    }
  }
};
