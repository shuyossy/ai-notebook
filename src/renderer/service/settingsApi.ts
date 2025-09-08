import { SettingsSavingStatus, Settings } from '@/types';
import { getData } from '../lib/apiUtils';
import { ApiServiceDefaultOptions } from '../types';

export interface ISettingsApi {
  getAgentStatus(options?: ApiServiceDefaultOptions): Promise<SettingsSavingStatus | null>;
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
    const result = await window.electron.settings.getStatus();
    return getData(result, options);
  }

  public async removeMessage(
    messageId: string,
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.settings.removeMessage(messageId);
    getData(result, options);
  }

  public async reinitialize(
    options?: ApiServiceDefaultOptions,
  ): Promise<void> {
    const result = await window.electron.settings.reinitialize();
    getData(result, options);
  }

  public async getSettings(
    options?: ApiServiceDefaultOptions,
  ): Promise<Settings | null> {
    const result = await window.electron.settings.getSettings();
    return getData(result, options);
  }

  public async setSettings(
    settings: Settings,
    options?: ApiServiceDefaultOptions,
  ): Promise<boolean | null> {
    const result = await window.electron.settings.setSettings(settings);
    return getData(result, options);
  }
}
