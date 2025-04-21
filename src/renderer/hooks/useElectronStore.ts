import { useState, useEffect, useCallback } from 'react';

/**
 * Electronのストア操作用フック
 * @param key ストアのキー
 * @param defaultValue デフォルト値
 * @returns [値, セッター関数]
 */
export function useElectronStore<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => Promise<void>] {
  const [value, setValue] = useState<T>(defaultValue);
  const [isInitialized, setIsInitialized] = useState(false);

  // 初期値の取得
  useEffect(() => {
    const fetchInitialValue = async () => {
      try {
        const storedValue = await window.electron.store.get(key);
        if (storedValue !== undefined) {
          setValue(storedValue as T);
        }
        setIsInitialized(true);
      } catch (error) {
        console.error(`Failed to get value for key "${key}":`, error);
        setIsInitialized(true);
      }
    };

    fetchInitialValue();
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
