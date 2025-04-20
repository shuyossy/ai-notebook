import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// API設定の確認
if (!process.env.API_KEY) {
    throw new Error('API_KEY環境変数が設定されていません');
  }
  if (!process.env.API_URL) {
    throw new Error('API_URL環境変数が設定されていません');
  }
  if (!process.env.API_MODEL) {
    throw new Error('API_MODEL環境変数が設定されていません');
  }
  const apiKey = process.env.API_KEY;
  const baseURL = process.env.API_URL;
  const modelName = process.env.API_MODEL;

const openAICompatibleModel = createOpenAICompatible({
  name: 'openAICompatibleModel',
  apiKey,
  baseURL,
}).chatModel(modelName);

export default openAICompatibleModel;