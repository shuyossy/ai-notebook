import { useState, useEffect } from 'react';

/**
 * Electronのストア操作の結果型
 */
export type StoreHookResult<T> = {
  value: T;
  loading: boolean;
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);

  // 値の取得
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchValue = async () => {
      try {
        const storedValue = await window.electron.store.get(key);
        if (storedValue !== undefined) {
          setValue(storedValue as T);
        }
        setError(null);
        // 成功時はポーリングを停止
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '不明なエラーが発生しました';
        setError(`値の取得に失敗しました: ${message}`);
        console.error(`Failed to get value for key "${key}":`, err);
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
      await window.electron.store.set(key, newValue);
      setValue(newValue);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '不明なエラーが発生しました';
      setError(`値の保存に失敗しました: ${message}`);
      console.error(`Failed to set value for key "${key}":`, err);
      throw err;
    }
  };

  return { value, loading, error, setValue: setStoreValue };
}

export default useElectronStore;
