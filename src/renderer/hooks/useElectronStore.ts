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
    const fetchValue = async () => {
      try {
        const storedValue = await window.electron.store.get(key);
        if (storedValue !== undefined) {
          setValue(storedValue as T);
        }
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '不明なエラーが発生しました';
        setError(`値の取得に失敗しました: ${message}`);
        console.error(`Failed to get value for key "${key}":`, err);
      } finally {
        setLoading(false);
      }
    };

    fetchValue();
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
