/**
 * src/mastra/agents/model/aibow.ts
 *
 * Aibow ― 独自エンドポイントを Vercel AI SDK / Mastra から利用する
 * LanguageModelV1 実装および Custom Provider 定義
 */

import { customProvider, APICallError } from 'ai';
import type {
  LanguageModelV1,
  LanguageModelV1Prompt,
  LanguageModelV1FinishReason,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';

export interface AibowSettings {
  baseURL?: string;
  apiKey?: string;
  temperature?: number;
}

function createAibowChatModel(
  modelId: string,
  defaultSettings: AibowSettings = {},
): LanguageModelV1 {
  return {
    specificationVersion: 'v1',
    provider: 'aibow',
    modelId,
    defaultObjectGenerationMode: undefined,

    // ─── 非ストリーミング生成 ───────────────────────────────────
    async doGenerate(options: LanguageModelV1CallOptions) {
      // prefer-destructuring ルールに従い分割代入
      const { prompt }: { prompt: LanguageModelV1Prompt } = options;
      const {
        baseURL = process.env.AIBOW_API_BASE_URL,
        apiKey = process.env.AIBOW_API_KEY,
        temperature = defaultSettings.temperature ?? 1,
      } = defaultSettings;

      const url = `${baseURL}/v1/chat`;
      const bodyObj = { messages: prompt, temperature };
      const body = JSON.stringify(bodyObj);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body,
      });

      if (!res.ok) {
        const responseBody = await res.text();
        // APICallError に必須の message プロパティを含めて投げる
        throw new APICallError({
          message: responseBody,
          url,
          requestBodyValues: body,
          statusCode: res.status,
          responseHeaders: Object.fromEntries(res.headers.entries()),
          responseBody,
          isRetryable: res.status >= 500,
        });
      }

      const { text } = (await res.json()) as { text: string };

      return {
        text,
        finishReason: 'stop' as LanguageModelV1FinishReason,
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: {
          rawPrompt: prompt,
          rawSettings: { baseURL, apiKey, temperature },
        },
        rawResponse: {
          headers: Object.fromEntries(res.headers.entries()),
        },
        warnings: [] as LanguageModelV1CallWarning[],
      };
    },

    // ─── ストリーミング生成 ───────────────────────────────────
    async doStream(options: LanguageModelV1CallOptions) {
      const { prompt }: { prompt: LanguageModelV1Prompt } = options;
      const {
        baseURL = process.env.AIBOW_API_BASE_URL,
        apiKey = process.env.AIBOW_API_KEY,
        temperature = defaultSettings.temperature ?? 1,
      } = defaultSettings;

      const url = `${baseURL}/v1/chat`;
      const bodyObj = { messages: prompt, temperature };
      const body = JSON.stringify(bodyObj);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body,
      });

      if (!res.ok) {
        const responseBody = await res.text();
        throw new APICallError({
          message: responseBody,
          url,
          requestBodyValues: body,
          statusCode: res.status,
          responseHeaders: Object.fromEntries(res.headers.entries()),
          responseBody,
          isRetryable: res.status >= 500,
        });
      }

      const fullText = await res.text();

      // ReadableStream に文字単位で詰め替え
      const stream = new ReadableStream<LanguageModelV1StreamPart>({
        start(controller) {
          for (const ch of fullText) {
            controller.enqueue({ type: 'text-delta', textDelta: ch });
          }
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: { promptTokens: 0, completionTokens: 0 },
          });
          controller.close();
        },
      });

      return {
        stream,
        rawCall: {
          rawPrompt: prompt,
          rawSettings: { baseURL, apiKey, temperature },
        },
        rawResponse: {
          headers: Object.fromEntries(res.headers.entries()),
        },
        request: { body },
        warnings: [] as LanguageModelV1CallWarning[],
      };
    },
  };
}

export const aibowProvider = customProvider({
  languageModels: {
    'aibow/plain': createAibowChatModel('aibow/plain'),
  },
});

export const aibow = aibowProvider.languageModel('aibow/plain');
