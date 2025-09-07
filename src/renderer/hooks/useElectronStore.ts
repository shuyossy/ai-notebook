import { useState, useEffect } from 'react';
import { ElectronStoreApi } from '../service/electronStoreApi';

/**
 * Electronのストア操作の結果型
 */
export type StoreHookResult<T> = {
  value: T;
  loading: boolean;
  setValue: (value: T) => Promise<void>;
};

/**
 * Electronのストア操作用フック
 * @param key ストアのキー
 * @returns StoreHookResult
 */
export function useElectronStore<T extends Record<string, unknown>>(
  key: string,
): StoreHookResult<T> {
  const [value, setValue] = useState<T>({} as T);
  const [loading, setLoading] = useState(true);

  // 値の取得
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchValue = async () => {
      try {
        const storeApi = ElectronStoreApi.getInstance();
        const storedValue = await storeApi.get(key, {
          showAlert: false,
          throwError: true,
          printErrorLog: false,
        });
        if (storedValue !== undefined) {
          setValue(storedValue as T);
        }
        // 成功時はポーリングを停止
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '不明なエラーが発生しました';
        console.error(`Failed to get value from electron-store for key "${key}":`, err);
        // 失敗時はポーリングを継続（既に設定済みの場合は何もしない）
        if (!intervalId) {
          intervalId = setInterval(fetchValue, 5000);
        }
      } finally {
        setLoading(false);
      }
    };

    // 初回実行
    fetchValue();

    // クリーンアップ関数
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [key]);

  // 値の設定
  const setStoreValue = async (newValue: T) => {
    try {
      const storeApi = ElectronStoreApi.getInstance();
      await storeApi.set({ key, value: newValue }, {
        showAlert: false,
        throwError: true,
        printErrorLog: false,
      });
      setValue(newValue);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '不明なエラーが発生しました';
      console.error(`Failed to set value for key "${key}":`, err);
      throw err;
    }
  };

  return { value, loading, setValue: setStoreValue };
}

export default useElectronStore;
