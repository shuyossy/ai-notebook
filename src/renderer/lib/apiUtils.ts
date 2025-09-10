import { IpcResult } from '@/types';
import { alertStore } from '../stores/alertStore';
import { ApiServiceDefaultOptions } from '../types';
import { appApiCallError, appApiError } from './error';

/**
 * API通信の結果を取り出す関数
 */
export function getData<T>(
  result: IpcResult<T>,
  options?: ApiServiceDefaultOptions,
): T | null {
  const showAlert = options?.showAlert ?? false;
  const throwError = options?.throwError ?? true;

  if (result.success) {
    return result.data as T;
  } else {
    console.error(result.error);
    if (showAlert) {
      alertStore.getState().addAlert({
        message: result.error?.message || '不明なエラー',
        severity: 'error',
      });
    }
    if (throwError) {
      throw appApiError(result.error!);
    }
    return null;
  }
}

/**
 * API通信を行う関数をラップ
 */
export async function invokeApi<T>(
  fn: () => Promise<IpcResult<T>>,
  options?: ApiServiceDefaultOptions,
): Promise<T | null> {
  const showAlert = options?.showAlert ?? false;
  const throwError = options?.throwError ?? true;
  let result: IpcResult<T>;
  try {
    result = await fn();
  } catch (error) {
    console.error('API通信に失敗しました:', error);
    if (throwError) {
      throw appApiCallError(error);
    }
    result = {
      success: false,
      error: { message: 'API通信に失敗しました', code: 'INTERNAL' },
    };
  }
  return getData(result, options);
}
