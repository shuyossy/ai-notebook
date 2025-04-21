import { Settings, SettingsSchema } from '../types';

// 設定の管理サービス
export const settingsService = {
  /**
   * 現在の設定を取得する
   * @returns 設定オブジェクト
   */
  getSettings: async (): Promise<Settings> => {
    try {
      const database = await window.electron.store.get('database');
      const source = await window.electron.store.get('source');
      const api = await window.electron.store.get('api');

      return {
        database,
        source,
        api,
      };
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
      // 各セクションを個別に保存
      await window.electron.store.set('database', validatedSettings.database);
      await window.electron.store.set('source', validatedSettings.source);
      await window.electron.store.set('api', validatedSettings.api);
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
