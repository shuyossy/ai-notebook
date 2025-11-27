import * as fs from 'fs/promises';
import * as path from 'path';
import * as vm from 'vm';
import { getCustomAppDataDir } from '../main';
import { getPluginLogger } from '../lib/logger';
import type {
  ReviewPlugin,
  PluginInfo,
  DocumentFilterHook,
  SingleDocumentFilterHook,
  ChunkStrategyHook,
} from '@/types/plugin';
import { AppError, internalError } from '@/main/lib/error';

const logger = getPluginLogger();

// プラグインファイルの固定名
const PLUGIN_FILE_NAME = 'review-plugin.js';

// プラグインディレクトリパス
const PLUGIN_DIR_NAME = 'plugins';

// フック実行のタイムアウト（ミリ秒）
const HOOK_EXECUTION_TIMEOUT = 60000;

/**
 * プラグインサービスのインターフェース
 */
export interface IPluginService {
  /**
   * プラグインファイルをアップロード（既存ファイルを削除して新規保存）
   * @param sourceFilePath - アップロード元のファイルパス
   */
  uploadPlugin(sourceFilePath: string): Promise<void>;

  /**
   * 現在のプラグイン情報を取得
   * @returns プラグイン情報（プラグインがない場合はnull）
   */
  getPluginInfo(): Promise<PluginInfo | null>;

  /**
   * プラグインを削除
   */
  deletePlugin(): Promise<void>;

  /**
   * プラグインをリロード（キャッシュクリア）
   */
  reloadPlugin(): void;

  /**
   * beforeSmallDocumentReviewフックを実行（少量レビュー用）
   * @param context - フックコンテキスト
   * @returns フィルタリング後のドキュメント（エラー時は元のドキュメントをそのまま返す）
   */
  executeBeforeSmallDocumentReviewHook(
    context: Parameters<DocumentFilterHook>[0],
  ): Promise<ReturnType<DocumentFilterHook>>;

  /**
   * beforeLargeDocumentReviewフックを実行（大量レビュー用）
   * @param context - フックコンテキスト
   * @returns フィルタリング後のドキュメント（nullの場合はスキップ、エラー時は元のドキュメントをそのまま返す）
   */
  executeBeforeLargeDocumentReviewHook(
    context: Parameters<SingleDocumentFilterHook>[0],
  ): Promise<ReturnType<SingleDocumentFilterHook>>;

  /**
   * chunkStrategyフックを実行
   * @param context - フックコンテキスト
   * @returns 分割範囲の配列（エラー時はnullを返す）
   */
  executeChunkStrategyHook(
    context: Parameters<ChunkStrategyHook>[0],
  ): Promise<Awaited<ReturnType<ChunkStrategyHook>> | null>;
}

/**
 * プラグイン管理サービス
 */
export class PluginService implements IPluginService {
  // シングルトンインスタンス
  private static instance: PluginService;

  // ロード済みプラグインキャッシュ
  private cachedPlugin: ReviewPlugin | null = null;

  // プラグインファイルの絶対パス
  private get pluginFilePath(): string {
    const appDataDir = getCustomAppDataDir();
    return path.join(appDataDir, PLUGIN_DIR_NAME, PLUGIN_FILE_NAME);
  }

  // プラグインディレクトリの絶対パス
  private get pluginDirPath(): string {
    const appDataDir = getCustomAppDataDir();
    return path.join(appDataDir, PLUGIN_DIR_NAME);
  }

  // シングルトンインスタンスを取得
  public static getInstance(): PluginService {
    if (!PluginService.instance) {
      PluginService.instance = new PluginService();
    }
    return PluginService.instance;
  }

  /**
   * プラグインファイルをアップロード
   */
  async uploadPlugin(sourceFilePath: string): Promise<void> {
    try {
      logger.info('[PluginService] Uploading plugin from:', sourceFilePath);

      // プラグインディレクトリが存在しない場合は作成
      await fs.mkdir(this.pluginDirPath, { recursive: true });

      // 既存プラグインファイルを削除
      await this.deletePlugin();

      // 新しいプラグインファイルをコピー
      await fs.copyFile(sourceFilePath, this.pluginFilePath);

      // キャッシュをクリア
      this.reloadPlugin();

      // 即時にロードして検証、問題があればこの時点で例外を投げる
      await this.loadPlugin();

      logger.info('[PluginService] Plugin uploaded successfully');
    } catch (error) {
      logger.error('[PluginService] Failed to upload plugin:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw internalError({
        expose: true,
        messageCode: 'PLUGIN_UPLOAD_ERROR',
        cause: error,
      });
    }
  }

  /**
   * 現在のプラグイン情報を取得
   */
  async getPluginInfo(): Promise<PluginInfo | null> {
    // プラグインファイルの存在確認
    try {
      await fs.access(this.pluginFilePath);
    } catch {
      // ファイルが存在しない
      return null;
    }

    // プラグインをロード
    const plugin = await this.loadPlugin();
    if (!plugin) {
      return null;
    }

    // 利用可能なフック名を収集
    const availableHooks: string[] = [];
    if (plugin.hooks?.beforeSmallDocumentReview) {
      availableHooks.push('beforeSmallDocumentReview');
    }
    if (plugin.hooks?.beforeLargeDocumentReview) {
      availableHooks.push('beforeLargeDocumentReview');
    }
    if (plugin.hooks?.chunkStrategy) {
      availableHooks.push('chunkStrategy');
    }

    return {
      name: plugin.name,
      version: plugin.version,
      filePath: this.pluginFilePath,
      availableHooks,
    };
  }

  /**
   * プラグインを削除
   */
  async deletePlugin(): Promise<void> {
    try {
      // ファイルが存在する場合は削除
      try {
        await fs.access(this.pluginFilePath);
        await fs.unlink(this.pluginFilePath);
        logger.info('[PluginService] Plugin deleted');
      } catch {
        // ファイルが存在しない場合は何もしない
      }

      // キャッシュをクリア
      this.reloadPlugin();
    } catch (error) {
      logger.error('[PluginService] Failed to delete plugin:', error);
      throw internalError({
        expose: true,
        messageCode: 'PLUGIN_DELETE_ERROR',
        cause: error,
      });
    }
  }

  /**
   * プラグインをリロード（キャッシュクリア）
   */
  reloadPlugin(): void {
    this.cachedPlugin = null;
    logger.info('[PluginService] Plugin cache cleared');
  }

  /**
   * beforeSmallDocumentReviewフックを実行（少量レビュー用）
   */
  async executeBeforeSmallDocumentReviewHook(
    context: Parameters<DocumentFilterHook>[0],
  ): Promise<ReturnType<DocumentFilterHook>> {
    try {
      const plugin = await this.loadPlugin();
      if (!plugin?.hooks?.beforeSmallDocumentReview) {
        logger.debug(
          '[PluginService] beforeSmallDocumentReview hook not available, returning original documents',
        );
        return context.documents;
      }

      logger.info('[PluginService] Executing beforeSmallDocumentReview hook');
      const result = await this.executeHookWithTimeout(
        plugin.hooks.beforeSmallDocumentReview,
        context,
        'beforeSmallDocumentReview',
      );
      logger.info(
        '[PluginService] beforeSmallDocumentReview hook completed successfully',
      );
      return result;
    } catch (error) {
      logger.error(
        '[PluginService] beforeSmallDocumentReview hook failed:',
        error,
      );
      // エラー時は元のドキュメントをそのまま返す
      return context.documents;
    }
  }

  /**
   * beforeLargeDocumentReviewフックを実行（大量レビュー用）
   */
  async executeBeforeLargeDocumentReviewHook(
    context: Parameters<SingleDocumentFilterHook>[0],
  ): Promise<ReturnType<SingleDocumentFilterHook>> {
    try {
      const plugin = await this.loadPlugin();
      if (!plugin?.hooks?.beforeLargeDocumentReview) {
        logger.debug(
          '[PluginService] beforeLargeDocumentReview hook not available, returning original document',
        );
        return context.document;
      }

      logger.info('[PluginService] Executing beforeLargeDocumentReview hook');
      const result = await this.executeHookWithTimeout(
        plugin.hooks.beforeLargeDocumentReview,
        context,
        'beforeLargeDocumentReview',
      );
      logger.info(
        '[PluginService] beforeLargeDocumentReview hook completed successfully',
      );
      return result;
    } catch (error) {
      logger.error(
        '[PluginService] beforeLargeDocumentReview hook failed:',
        error,
      );
      // エラー時は元のドキュメントをそのまま返す
      return context.document;
    }
  }

  /**
   * chunkStrategyフックを実行
   */
  async executeChunkStrategyHook(
    context: Parameters<ChunkStrategyHook>[0],
  ): Promise<Awaited<ReturnType<ChunkStrategyHook>> | null> {
    try {
      const plugin = await this.loadPlugin();
      if (!plugin?.hooks?.chunkStrategy) {
        logger.debug(
          '[PluginService] chunkStrategy hook not available, returning null',
        );
        return null;
      }

      logger.info('[PluginService] Executing chunkStrategy hook');
      const result = await this.executeHookWithTimeout(
        plugin.hooks.chunkStrategy,
        context,
        'chunkStrategy',
      );
      logger.info('[PluginService] chunkStrategy hook completed successfully');
      return result;
    } catch (error) {
      logger.error('[PluginService] chunkStrategy hook failed:', error);
      // エラー時はnullを返す（デフォルトの分割戦略を使用）
      return null;
    }
  }

  /**
   * プラグインをロード（VMサンドボックスで実行）
   * @private
   */
  private async loadPlugin(): Promise<ReviewPlugin | null> {
    // キャッシュがあればそれを返す
    if (this.cachedPlugin) {
      return this.cachedPlugin;
    }

    try {
      await fs.access(this.pluginFilePath);
    } catch {
      return null;
    }

    try {
      // プラグインファイルを読み込み
      const pluginCode = await fs.readFile(this.pluginFilePath, 'utf-8');
      const normalizedCode = this.normalizePluginCode(pluginCode);

      const { sandbox, context } = this.createPluginSandbox();

      const script = new vm.Script(normalizedCode, {
        filename: this.pluginFilePath,
      });

      script.runInContext(context);

      // プラグインオブジェクトを取得
      const plugin = sandbox.module.exports.default || sandbox.module.exports;

      // プラグインの検証
      if (!this.validatePlugin(plugin)) {
        throw new Error(
          'Invalid plugin structure. Please ensure name, version, and hook definitions are valid.',
        );
      }

      const typedPlugin = plugin as ReviewPlugin;

      // キャッシュに保存
      this.cachedPlugin = typedPlugin;
      logger.info(
        '[PluginService] Plugin loaded successfully:',
        typedPlugin.name,
      );

      return this.cachedPlugin;
    } catch (error) {
      this.cachedPlugin = null;
      throw this.createPluginLoadError(error);
    }
  }

  /**
   * プラグイン構造の検証
   * @private
   */
  private validatePlugin(plugin: unknown): boolean {
    if (!plugin || typeof plugin !== 'object') {
      return false;
    }

    const p = plugin as Partial<ReviewPlugin>;

    // nameとversionは必須
    if (typeof p.name !== 'string' || typeof p.version !== 'string') {
      return false;
    }

    // hooksは任意だが、存在する場合はオブジェクト
    if (p.hooks !== undefined && typeof p.hooks !== 'object') {
      return false;
    }

    // フックが存在する場合は関数であることを確認
    if (p.hooks) {
      if (
        p.hooks.beforeSmallDocumentReview !== undefined &&
        typeof p.hooks.beforeSmallDocumentReview !== 'function'
      ) {
        return false;
      }
      if (
        p.hooks.beforeLargeDocumentReview !== undefined &&
        typeof p.hooks.beforeLargeDocumentReview !== 'function'
      ) {
        return false;
      }
      if (
        p.hooks.chunkStrategy !== undefined &&
        typeof p.hooks.chunkStrategy !== 'function'
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * タイムアウト付きでフックを実行
   * @private
   */
  private async executeHookWithTimeout<T>(
    hookFn: (context: any) => T | Promise<T>,
    context: any,
    hookName: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`Plugin hook "${hookName}" execution timeout exceeded`),
        );
      }, HOOK_EXECUTION_TIMEOUT);

      Promise.resolve(hookFn(context))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * ESMコードか判定
   */
  private isEsModuleCode(pluginCode: string): boolean {
    const trimmed = pluginCode.trimStart();
    if (trimmed.startsWith('import') || trimmed.startsWith('export')) {
      return true;
    }
    return /\b(?:import|export)\b/.test(pluginCode);
  }

  /**
   * プラグインコードをCJSとして実行できる形にする
   */
  private normalizePluginCode(pluginCode: string): string {
    if (!this.isEsModuleCode(pluginCode)) {
      return pluginCode;
    }

    if (/\bimport\b/.test(pluginCode)) {
      throw new Error(
        'Import statements are not allowed in plugins. Bundle dependencies into a single file before uploading.',
      );
    }

    let transformed = pluginCode.replace(
      /export\s+default\s+/g,
      'module.exports = ',
    );

    transformed = transformed.replace(
      /export\s*\{\s*([A-Za-z0-9_$]+)\s+as\s+default\s*\}\s*;?/g,
      'module.exports = $1;',
    );

    if (/\bexport\b/.test(transformed)) {
      throw new Error('Only default exports are supported in review plugins.');
    }

    return transformed;
  }

  /**
   * サンドボックスとVMコンテキストを作成
   */
  private createPluginSandbox(): {
    sandbox: PluginSandbox;
    context: vm.Context;
  } {
    const sandbox: PluginSandbox = {
      exports: {},
      module: { exports: {} },
      console: this.createConsoleProxy(),
      require: () => {
        throw new Error('Using require is not allowed in plugins');
      },
    };

    const context = vm.createContext(sandbox);
    return { sandbox, context };
  }

  /**
   * プラグイン用のconsoleを生成
   */
  private createConsoleProxy() {
    return {
      log: (...args: unknown[]) => logger.debug('[Plugin]', ...args),
      error: (...args: unknown[]) => logger.error('[Plugin]', ...args),
      warn: (...args: unknown[]) => logger.warn('[Plugin]', ...args),
      info: (...args: unknown[]) => logger.info('[Plugin]', ...args),
    };
  }

  /**
   * プラグイン読み込みエラーをAppErrorに変換
   */
  private createPluginLoadError(error: unknown): AppError {
    const detail =
      error instanceof Error
        ? error.message
        : 'Unknown error occurred while loading plugin';
    logger.error('[PluginService] Failed to load plugin:', error);
    return internalError({
      expose: true,
      messageCode: 'PLUGIN_LOAD_ERROR',
      messageParams: { detail },
      cause: error,
    });
  }
}

type PluginSandbox = {
  exports: Record<string, unknown>;
  module: { exports: Record<string, unknown> };
  console: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
  };
  require: () => never;
};

// シングルトンインスタンスをエクスポート
export const pluginService = PluginService.getInstance();
