import { RuntimeContext } from '@mastra/core/runtime-context';
import { FinishReason } from 'ai';
import { BaseRuntimeContext } from './types';
import { getStore } from '../../main/store';

// BaseRuntimeConotextに値を入れた上で、指定したRuntimeContextを返す関数
export function createRuntimeContext<T extends BaseRuntimeContext>() {
  const store = getStore();
  const runtimeContext = new RuntimeContext<T>();
  // @ts-ignore
  runtimeContext.set('model', {
    key: store.get('api').key,
    url: store.get('api').url,
    modelName: store.get('api').model,
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
