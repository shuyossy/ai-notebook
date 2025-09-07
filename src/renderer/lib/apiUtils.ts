import { IpcResult } from '@/types';
import { alertStore } from '../stores/alertStore';
import { ApiServiceDefaultOptions } from '../types';

/**
 * API通信の結果を取り出す関数
 */
export function getData<T>(
  result: IpcResult<T>,
  options?: ApiServiceDefaultOptions,
): T | null {
  const printErrorLog = options?.printErrorLog ?? true;
  const showAlert = options?.showAlert ?? false;
  const throwError = options?.throwError ?? true;

  if (result.success) {
    return result.data as T;
  } else {
    if (printErrorLog) {
      console.error(result.error);
    }
    if (showAlert) {
      alertStore.getState().addAlert({
        message: result.error?.message || '不明なエラー',
        severity: 'error',
      });
    }
    if (throwError) {
      throw new Error(result.error?.message);
    }
    return null;
  }
}
