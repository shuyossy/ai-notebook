import { z } from 'zod';
import { Settings, SettingsSchema } from '@/types';
import { getStore } from '../store';
import { repositoryError } from './error';

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

let SettingsRepository: ISettingsRepository | null = null;

export const getSettingsRepository = (): ISettingsRepository => {
  if (!SettingsRepository) {
    SettingsRepository = new ElectronStoreSettingsRepository();
  }
  return SettingsRepository;
};

/**
 * Electron Storeを使用した設定リポジトリの実装
 */
class ElectronStoreSettingsRepository implements ISettingsRepository {
  private store = getStore();

  async getSettings(): Promise<Settings> {
    try {
      const settings = await SettingsSchema.parseAsync(this.store.store);
      return settings;
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw repositoryError('設定情報の形式が不正です', err);
      }
      throw repositoryError('設定情報の取得に失敗しました', err);
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    try {
      this.store.set('database.dir', settings.database.dir);
      this.store.set('source.registerDir', settings.source.registerDir);
      this.store.set('api.key', settings.api.key);
      this.store.set('api.model', settings.api.model);
      this.store.set('api.url', settings.api.url);
      this.store.set('redmine.endpoint', settings.redmine.endpoint);
      this.store.set('redmine.apiKey', settings.redmine.apiKey);
      this.store.set('gitlab.endpoint', settings.gitlab.endpoint);
      this.store.set('gitlab.apiKey', settings.gitlab.apiKey);
      this.store.set('systemPrompt.content', settings.systemPrompt.content);
      if (settings.mcp.serverConfig) {
        this.store.set(
          'mcp.serverConfig',
          JSON.stringify(settings.mcp.serverConfig, null, 2),
        );
      }
    } catch (err) {
      throw repositoryError('設定情報の保存に失敗しました', err);
    }
  }
}
