import { getData } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';
import { Source } from '@/db/schema';

export interface ISourceApi {
  reloadSources(options?: ApiServiceDefaultOptions): Promise<void>;
  getSources(options?: ApiServiceDefaultOptions): Promise<Source[] | null>;
  updateSourceEnabled(
    id: number,
    enabled: boolean,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
}

export class SourceApi implements ISourceApi {
  // シングルトン変数
  private static instance: SourceApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): SourceApi {
    if (!SourceApi.instance) {
      SourceApi.instance = new SourceApi();
    }
    return SourceApi.instance;
  }

  public async reloadSources(
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.source.reloadSources();
    getData(result, options);
  }

  public async getSources(
    options?: ApiServiceDefaultOptions,
  ): Promise<Source[] | null> {
    const result = await window.electron.source.getSources();
    const data = getData(result, options);
    return data as Source[] | null;
  }

  public async updateSourceEnabled(
    id: number,
    enabled: boolean,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.source.updateSourceEnabled({
      sourceId: id,
      isEnabled: enabled
    });
    getData(result, options);
  }
}
