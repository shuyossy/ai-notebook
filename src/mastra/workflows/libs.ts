import { WorkflowResult } from '@mastra/core';
import { baseStepOutputSchema } from './schema';
import { z } from "zod";

// workflowの結果を確認するための関数
export function checkStatus(result: WorkflowResult<any, any>): {
  status: 'success' | 'failed' | 'suspended';
  errorMessage?: string;
} {
  // ワークフロー全体がfailedの場合(本アプリについてはエラーの場合、stepとしては成功させ、outputのstatusをfailedと指定するため、発生しないはず)
  if (result.status === 'failed') {
    return {
      status: 'failed',
      errorMessage: result.error.message,
    };
  }

  if (result.status == 'suspended') {
    return {
      status: 'suspended',
    };
  }

  // Object.valuesでオブジェクトの値だけを配列として取り出す
  const values = Object.values(result.result);

  // 1つでもstatusがfailedのものを探す
  const failedItem = (values as z.infer<typeof baseStepOutputSchema>[]).find((item: any) => item.status === 'failed');

  // failedが見つかった場合
  if (failedItem) {
    return {
      status: 'failed',
      errorMessage: failedItem.errorMessage,
    };
  }

  // すべてsuccessの場合
  return {
    status: 'success',
  };
}
