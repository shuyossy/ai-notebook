// @ts-ignore
import { RuntimeContext } from '@mastra/core/runtime-context';
import { FinishReason } from 'ai';
import { getSettingsRepository } from '@/adapter/db';
import { BaseRuntimeContext } from '../agents/types';
import { AppError, extractAIAPISafeError } from '@/main/lib/error';
import { APICallError } from 'ai';

// BaseRuntimeConotextに値を入れた上で、指定したRuntimeContextを返す関数
export async function createRuntimeContext<T extends BaseRuntimeContext>() {
  const runtimeContext = new RuntimeContext<T>();
  const settingsRepository = getSettingsRepository();
  const store = await settingsRepository.getSettings();
  // @ts-ignore
  runtimeContext.set('model', {
    key: store.api.key,
    url: store.api.url,
    modelName: store.api.model,
  });
  return runtimeContext;
}

// finishreasonを元に正常終了かどうかを判定する関数
export function judgeFinishReason(finishReason: FinishReason): {
  success: boolean;
  reason: string;
} {
  switch (finishReason) {
    case 'stop':
      return { success: true, reason: '正常終了' };
    case 'length':
      return {
        success: false,
        reason: 'AIモデルの最大出力コンテキストを超えました',
      };
    case 'content-filter':
      return {
        success: false,
        reason: 'コンテンツフィルターにより出力が制限されました',
      };
    case 'error':
      return { success: false, reason: 'AIモデルで不明なエラーが発生しました' };
    default:
      return { success: true, reason: '不明な終了理由' };
  }
}

export const judgeErrorIsContentLengthError = (error: unknown) => {
  const apiError = extractAIAPISafeError(error);
  if (!apiError) return false;
  if (apiError instanceof AppError) {
    return apiError.messageCode === 'AI_MESSAGE_TOO_LARGE';
  }
  if (APICallError.isInstance(apiError)) {
    return (
      apiError.responseBody?.includes('maximum context length') ||
      apiError.responseBody?.includes('tokens_limit_reached') ||
      apiError.responseBody?.includes('context_length_exceeded') ||
      apiError.responseBody?.includes('many images')
    );
  }
  return false;
};
