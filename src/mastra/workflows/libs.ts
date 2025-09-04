import { WorkflowResult } from '@mastra/core';
import { baseStepOutputSchema } from './schema';
import { z } from 'zod';

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

  // 1つでもstatusがfailedのものを探す
  const { allPassed, errors } = checkStatuses(result.result);
  if (!allPassed) {
    // 最初のエラーを返す
    return {
      status: 'failed',
      errorMessage: errors[0]?.message || '不明なエラー',
    };
  }

  // すべてsuccessの場合
  return {
    status: 'success',
  };
}

// 監視対象の Result 型
type Result = z.infer<typeof baseStepOutputSchema>;

/**
 * オブジェクト内を深く走査し、以下を検出します:
 *  - Result型: status === 'failed'
 *  - 互換: { status: boolean } で false
 *
 * 検出時はエラー配列に (path, message) を格納。
 * 参照循環も安全に処理。
 */
export function checkStatuses(input: unknown): {
  allPassed: boolean;
  errors: Array<{ path: string; message: string }>;
} {
  const errors: Array<{ path: string; message: string }> = [];
  const seen = new WeakSet<object>();

  const isObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object';

  const isResult = (v: unknown): v is Result =>
    isObject(v) && (v.status === 'success' || v.status === 'failed');

  const toPath = (segments: (string | number)[]) =>
    segments.length === 0 ? '/' : '/' + segments.map(String).join('/');

  const pushError = (path: (string | number)[], msg?: unknown) => {
    const message =
      typeof msg === 'string' && msg.trim().length > 0 ? msg : 'Unknown error';
    errors.push({ path: toPath(path), message });
  };

  const dfs = (node: unknown, path: (string | number)[]) => {
    // プリミティブは無視
    if (!isObject(node)) return;

    // 参照循環を回避
    if (seen.has(node)) return;
    seen.add(node);

    // 配列なら子要素へ
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        dfs(node[i], [...path, i]);
      }
      return;
    }

    // --- まず Result 型の即時判定 ---
    if (isResult(node)) {
      if (node.status === 'failed') {
        pushError(path, node.errorMessage);
      }
      // Result と確定したら、その子階層にさらに潜る必要は通常なし
      // ただし Result の中にさらにネストがあるなら、必要に応じて下行を有効化
      // for (const [k, v] of Object.entries(node)) dfs(v, [...path, k]);
      return;
    }

    // --- 互換: { status: boolean } も扱う ---
    if ('status' in node) {
      const s = (node as Record<string, unknown>).status;
      if (typeof s === 'boolean' && s === false) {
        const msg =
          typeof (node as Record<string, unknown>).errorMessage === 'string'
            ? (node as Record<string, unknown>).errorMessage
            : undefined;
        pushError(path, msg);
        // 続行して他の失敗も拾う
      }
    }

    // それ以外は通常のオブジェクトとして子要素へ
    for (const [k, v] of Object.entries(node)) {
      dfs(v, [...path, k]);
    }
  };

  dfs(input, []);
  return { allPassed: errors.length === 0, errors };
}
