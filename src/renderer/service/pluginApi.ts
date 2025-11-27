import { PluginInfo } from '@/types/plugin';
import { ApiServiceDefaultOptions } from '../types';
import { invokeApi } from '../lib/apiUtils';

export interface IPluginApi {
  /**
   * プラグインファイルをアップロード
   * @param sourceFilePath - アップロード元のファイルパス
   * @param options - API呼び出しオプション
   */
  uploadPlugin(
    sourceFilePath: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;

  /**
   * 現在のプラグイン情報を取得
   * @param options - API呼び出しオプション
   * @returns プラグイン情報（プラグインがない場合はnull）
   */
  getPluginInfo(options?: ApiServiceDefaultOptions): Promise<PluginInfo | null>;

  /**
   * プラグインを削除
   * @param options - API呼び出しオプション
   */
  deletePlugin(options?: ApiServiceDefaultOptions): Promise<void>;

  /**
   * プラグインをリロード（キャッシュクリア）
   * @param options - API呼び出しオプション
   */
  reloadPlugin(options?: ApiServiceDefaultOptions): Promise<void>;
}

export class PluginApi implements IPluginApi {
  // シングルトン変数
  private static instance: PluginApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): PluginApi {
    if (!PluginApi.instance) {
      PluginApi.instance = new PluginApi();
    }
    return PluginApi.instance;
  }

  public async uploadPlugin(
    sourceFilePath: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(
      () => window.electron.plugin.upload(sourceFilePath),
      options,
    );
  }

  public async getPluginInfo(
    options?: ApiServiceDefaultOptions,
  ): Promise<PluginInfo | null> {
    return invokeApi(() => window.electron.plugin.getInfo(), options);
  }

  public async deletePlugin(options?: ApiServiceDefaultOptions): Promise<void> {
    await invokeApi(() => window.electron.plugin.delete(), options);
  }

  public async reloadPlugin(options?: ApiServiceDefaultOptions): Promise<void> {
    await invokeApi(() => window.electron.plugin.reload(), options);
  }
}
