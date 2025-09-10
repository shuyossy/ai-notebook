import { invokeApi } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';
import { Source } from '@/db/schema';
import { ElectronPushClient } from '../lib/ElectronPushClient';
import { IpcChannels } from '@/types';

export interface ISourceApi {
  reloadSources(options?: ApiServiceDefaultOptions): Promise<void>;
  getSources(options?: ApiServiceDefaultOptions): Promise<Source[] | null>;
  updateSourceEnabled(
    id: number,
    enabled: boolean,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  subscribeSourceReloadFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
  ): () => void;
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
    await invokeApi(() => window.electron.source.reloadSources(), options);
  }

  public async getSources(
    options?: ApiServiceDefaultOptions,
  ): Promise<Source[] | null> {
    return invokeApi(() => window.electron.source.getSources(), options);
  }

  public async updateSourceEnabled(
    id: number,
    enabled: boolean,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(() => window.electron.source.updateSourceEnabled({
      sourceId: id,
      isEnabled: enabled,
    }), options);
  }

  public subscribeSourceReloadFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
  ): () => void {
    const pushClient = new ElectronPushClient();
    return pushClient.subscribe(
      IpcChannels.SOURCE_RELOAD_FINISHED,
      (event) => {
        callback(event.payload);
      },
    );
  }
}
