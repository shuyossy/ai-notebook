import { Settings } from '@/types';

export interface ISettingsRepository {
  /**
   * 設定を取得する
   * @returns 設定情報
   */
  getSettings(): Promise<Settings>;

  /**
   * 設定を保存する
   * @param settings 保存する設定情報
   */
  saveSettings(settings: Settings): Promise<void>;
}
