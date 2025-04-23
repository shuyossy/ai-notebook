import { useState, useEffect, useCallback } from 'react';

/**
 * Electronのストア操作用フック
 * @param key ストアのキー
 * @param defaultValue デフォルト値
 * @returns [値, セッター関数]
 */
export function useElectronStore<T extends Record<string, unknown>>(
  key: string,
): [T, (value: T) => Promise<void>] {
  const [value, setValue] = useState<T>({} as T);

  // 値の取得
  useEffect(() => {
    const fetchValue = async () => {
      try {
        const storedValue = await window.electron.store.get(key);
        if (storedValue !== undefined) {
          setValue(storedValue as T);
        }
      } catch (error) {
        console.error(`Failed to get value for key "${key}":`, error);
      }
    };

    fetchValue();
  }, [key]);

  // 値の設定
  const setStoreValue = useCallback(
    async (newValue: T) => {
      try {
        await window.electron.store.set(key, newValue);
        setValue(newValue);
      } catch (error) {
        console.error(`Failed to set value for key "${key}":`, error);
      }
    },
    [key],
  );

  return [value, setStoreValue];
}

export default useElectronStore;
