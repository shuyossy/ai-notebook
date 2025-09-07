import { getData } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';

export interface IElectronStoreApi {
  get(
    key: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<unknown | null>;
  set(
    options: { key: string; value: unknown },
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<boolean | null>;
}

export class ElectronStoreApi implements IElectronStoreApi {
  // シングルトン変数
  private static instance: ElectronStoreApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): ElectronStoreApi {
    if (!ElectronStoreApi.instance) {
      ElectronStoreApi.instance = new ElectronStoreApi();
    }
    return ElectronStoreApi.instance;
  }

  public async get(
    key: string,
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<unknown | null> {
    const result = await window.electron.store.store.get(key);
    return getData(result, apiOptions);
  }

  public async set(
    options: { key: string; value: unknown },
    apiOptions?: ApiServiceDefaultOptions,
  ): Promise<boolean | null> {
    const result = await window.electron.store.store.set(options);
    return getData(result, apiOptions);
  }
}
