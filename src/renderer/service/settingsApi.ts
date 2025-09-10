import { SettingsSavingStatus, Settings, IpcChannels } from '@/types';
import { invokeApi } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';
import { ElectronPushClient } from '../lib/ElectronPushClient';

export interface ISettingsApi {
  getAgentStatus(
    options?: ApiServiceDefaultOptions,
  ): Promise<SettingsSavingStatus | null>;
  removeMessage(
    messageId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void>;
  reinitialize(options?: ApiServiceDefaultOptions): Promise<void>;
  getSettings(options?: ApiServiceDefaultOptions): Promise<Settings | null>;
  setSettings(
    settings: Settings,
    options?: ApiServiceDefaultOptions,
  ): Promise<boolean | null>;
  subscribeSettingsUpdateFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
  ): () => void;
}

export class SettingsApi implements ISettingsApi {
  // シングルトン変数
  private static instance: SettingsApi;

  // コンストラクタをprivateにして外部からのインスタンス化を防止
  private constructor() {}

  // シングルトンインスタンスを取得するための静的メソッド
  public static getInstance(): SettingsApi {
    if (!SettingsApi.instance) {
      SettingsApi.instance = new SettingsApi();
    }
    return SettingsApi.instance;
  }

  public async getAgentStatus(
    options?: ApiServiceDefaultOptions,
  ): Promise<SettingsSavingStatus | null> {
    return invokeApi(() => window.electron.settings.getStatus(), options);
  }

  public async removeMessage(
    messageId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    await invokeApi(() => window.electron.settings.removeMessage(messageId), options);
  }

  public async reinitialize(options?: ApiServiceDefaultOptions): Promise<void> {
    await invokeApi(() => window.electron.settings.reinitialize(), options);
  }

  public async getSettings(
    options?: ApiServiceDefaultOptions,
  ): Promise<Settings | null> {
    return invokeApi(() => window.electron.settings.getSettings(), options);
  }

  public async setSettings(
    settings: Settings,
    options?: ApiServiceDefaultOptions,
  ): Promise<boolean | null> {
    return invokeApi(() => window.electron.settings.setSettings(settings), options);
  }

  public subscribeSettingsUpdateFinished(
    callback: (payload: { success: boolean; error?: string }) => void,
  ): () => void {
    const pushClient = new ElectronPushClient();
    return pushClient.subscribe(
      IpcChannels.SETTINGS_UPDATE_FINISHED,
      (event) => {
        callback(event.payload);
      },
    );
  }
}
