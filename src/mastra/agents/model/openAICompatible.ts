import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getStore } from '../../../main/store';

let model: ReturnType<ReturnType<typeof createOpenAICompatible>['chatModel']>;

const getOpenAICompatibleModel = () => {
  if (!model) {
    const store = getStore();
    const apiConfig = {
      key: store.get('api').key,
      url: store.get('api').url,
      model: store.get('api').model,
    };

    // API設定の確認
    if (!apiConfig.key) {
      throw new Error('APIキーが設定されていません');
    }
    if (!apiConfig.url) {
      throw new Error('APIのURLが設定されていません');
    }
    if (!apiConfig.model) {
      throw new Error('APIのモデル名が設定されていません');
    }

    model = createOpenAICompatible({
      name: 'openAICompatibleModel',
      apiKey: apiConfig.key,
      baseURL: apiConfig.url,
    }).chatModel(apiConfig.model);
  }
  return model;
};

export default getOpenAICompatibleModel;
