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

/** undefined を保存したら例外になるため、delete に切り替える */
function setOrDelete<T>(store: any, key: string, value: T | undefined) {
  if (value === undefined) {
    store.delete(key);
  } else {
    store.set(key, value);
  }
}

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
      // 必須系（undefined にならない想定）
      this.store.set('database.dir', settings.database.dir);
      this.store.set('api.key', settings.api.key);
      this.store.set('api.model', settings.api.model);
      this.store.set('api.url', settings.api.url);

      // 任意系は undefined の可能性があるため setOrDelete で処理
      setOrDelete(this.store, 'source.registerDir', settings.source.registerDir);

      setOrDelete(this.store, 'redmine.endpoint', settings.redmine.endpoint);
      setOrDelete(this.store, 'redmine.apiKey', settings.redmine.apiKey);

      setOrDelete(this.store, 'gitlab.endpoint', settings.gitlab.endpoint);
      setOrDelete(this.store, 'gitlab.apiKey', settings.gitlab.apiKey);

      setOrDelete(
        this.store,
        'systemPrompt.content',
        settings.systemPrompt.content,
      );

      if (settings.mcp.serverConfig) {
        this.store.set(
          'mcp.serverConfig',
          JSON.stringify(settings.mcp.serverConfig, null, 2),
        );
      } else {
        this.store.delete('mcp.serverConfig');
      }
    } catch (err) {
      throw repositoryError('設定情報の保存に失敗しました', err);
    }
  }
}
