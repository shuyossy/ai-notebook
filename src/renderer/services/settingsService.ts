import { Settings, SettingsSchema } from '../types';

// 設定の管理サービス
export const settingsService = {
  /**
   * 現在の設定を取得する
   * @returns 設定オブジェクト
   */
  getSettings: async (): Promise<Settings> => {
    try {
      const settings = (await window.electron.store.get(
        'settings',
      )) as Settings;
      if (!settings) {
        // デフォルト設定を返す
        const defaultSettings: Settings = {
          database: {
            dir: '',
          },
          source: {
            registerDir: './source',
          },
          api: {
            key: '',
            url: '',
            model: '',
          },
        };
        return defaultSettings;
      }
      return settings;
    } catch (error) {
      throw new Error(`設定の取得に失敗しました: ${(error as Error).message}`);
    }
  },

  /**
   * 設定を更新する
   * @param settings 更新する設定
   * @returns 更新結果
   */
  updateSettings: async (
    settings: Settings,
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      // 設定の検証
      const validatedSettings = SettingsSchema.parse(settings);

      // electron-storeに保存
      await window.electron.store.set('settings', validatedSettings);
      return {
        success: true,
        message: '設定が正常に更新されました',
      };
    } catch (error) {
      return {
        success: false,
        message: `設定の更新に失敗しました: ${(error as Error).message}`,
      };
    }
  },
};

export default settingsService;
