/**
 * PluginService のテスト
 * @jest-environment node
 */

// Electron モックを最初に適用
jest.mock('electron', () => require('../test-utils/mockElectron').mockElectron);
jest.mock(
  'electron-store',
  () => require('../test-utils/mockElectron').default,
);

// main.ts の初期化処理をスキップ
jest.mock('@/main/main', () => {
  const path = require('path');
  const os = require('os');
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test-plugin');
  return {
    getCustomAppDataDir: jest.fn(() => testAppData),
  };
});

// electron-log のモック
jest.mock('electron-log', () => ({
  create: jest.fn(() => ({
    transports: {
      file: { level: 'debug', resolvePathFn: jest.fn() },
      console: { level: 'debug' },
    },
    initialize: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// fs/promises のモック
const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockAccess = jest.fn();
const mockCopyFile = jest.fn().mockResolvedValue(undefined);
const mockUnlink = jest.fn().mockResolvedValue(undefined);
const mockReadFile = jest.fn();
jest.mock('fs/promises', () => ({
  mkdir: (...args: any[]) => mockMkdir(...args),
  access: (...args: any[]) => mockAccess(...args),
  copyFile: (...args: any[]) => mockCopyFile(...args),
  unlink: (...args: any[]) => mockUnlink(...args),
  readFile: (...args: any[]) => mockReadFile(...args),
}));

import path from 'path';
import { PluginService } from '@/main/service/pluginService';
import { getCustomAppDataDir } from '@/main/main';
import { AppError } from '@/main/lib/error';

const buildCommonJsPlugin = (hooks: string) => `
  module.exports = {
    name: 'test-plugin',
    version: '1.0.0',
    hooks: ${hooks}
  };
`;

const buildEsmPlugin = (hooks: string) => `
  const plugin = {
    name: 'esm-plugin',
    version: '1.0.0',
    hooks: ${hooks}
  };

  export default plugin;
`;

describe('PluginService', () => {
  let pluginService: PluginService;
  const testPluginPath = '/test/plugin.js';
  const appDataDir = getCustomAppDataDir();
  const pluginDirPath = path.join(appDataDir, 'plugins');
  const pluginFilePath = path.join(pluginDirPath, 'review-plugin.js');

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockReset();
    mockAccess.mockImplementation(() => Promise.resolve());
    mockReadFile.mockReset();
    // シングルトンをリセット
    (PluginService as any).instance = undefined;
    pluginService = PluginService.getInstance();
  });

  describe('シングルトンパターン', () => {
    it('getInstance()が同一インスタンスを返すこと', () => {
      const instance1 = PluginService.getInstance();
      const instance2 = PluginService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('uploadPlugin()', () => {
    it('プラグインファイルを正常にアップロードできること', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));
      mockReadFile.mockResolvedValueOnce(buildCommonJsPlugin(`{}`));

      await pluginService.uploadPlugin(testPluginPath);

      expect(mockMkdir).toHaveBeenCalledWith(pluginDirPath, {
        recursive: true,
      });
      expect(mockCopyFile).toHaveBeenCalledWith(testPluginPath, pluginFilePath);
    });

    it('既存プラグインファイルが削除されること', async () => {
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(buildCommonJsPlugin(`{}`));

      await pluginService.uploadPlugin(testPluginPath);

      expect(mockUnlink).toHaveBeenCalledWith(pluginFilePath);
      expect(mockCopyFile).toHaveBeenCalledWith(testPluginPath, pluginFilePath);
    });

    it('ファイルコピーに失敗した場合、PLUGIN_UPLOAD_ERRORをthrowすること', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));
      mockCopyFile.mockRejectedValueOnce(new Error('Copy failed'));

      await expect(
        pluginService.uploadPlugin(testPluginPath),
      ).rejects.toThrow();
    });

    it('プラグイン読み込みに失敗した場合、エラー内容が伝播すること', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));
      mockReadFile.mockResolvedValueOnce('export const invalid = true;');

      await expect(pluginService.uploadPlugin(testPluginPath)).rejects.toThrow(
        /プラグインの読み込みに失敗しました/,
      );
    });
  });

  describe('getPluginInfo()', () => {
    it('プラグインファイルが存在しない場合、nullを返すこと', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));

      const result = await pluginService.getPluginInfo();

      expect(result).toBeNull();
    });

    it('プラグインファイルが存在する場合、プラグイン情報を返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{
        beforeSmallDocumentReview: () => {},
        chunkStrategy: () => {}
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result = await pluginService.getPluginInfo();

      expect(result).toEqual({
        name: 'test-plugin',
        version: '1.0.0',
        filePath: pluginFilePath,
        availableHooks: ['beforeSmallDocumentReview', 'chunkStrategy'],
      });
    });

    it('プラグイン情報に利用可能なフックが含まれること', async () => {
      const pluginCode = buildCommonJsPlugin(`{
        beforeSmallDocumentReview: () => {},
        beforeLargeDocumentReview: () => {},
        chunkStrategy: () => {}
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result = await pluginService.getPluginInfo();

      expect(result?.availableHooks).toEqual([
        'beforeSmallDocumentReview',
        'beforeLargeDocumentReview',
        'chunkStrategy',
      ]);
    });

    it('ESM形式のプラグインを読み込めること', async () => {
      const pluginCode = buildEsmPlugin(`{
        beforeSmallDocumentReview: () => []
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result = await pluginService.getPluginInfo();

      expect(result).toEqual({
        name: 'esm-plugin',
        version: '1.0.0',
        filePath: pluginFilePath,
        availableHooks: ['beforeSmallDocumentReview'],
      });
    });

    it('プラグイン読み込みに失敗した場合、AppErrorをthrowすること', async () => {
      mockReadFile.mockResolvedValueOnce('import invalid from "module";');

      await expect(pluginService.getPluginInfo()).rejects.toThrow(AppError);
    });
  });

  describe('deletePlugin()', () => {
    it('プラグインファイルが正常に削除されること', async () => {
      mockAccess.mockResolvedValueOnce(undefined);

      await pluginService.deletePlugin();

      expect(mockUnlink).toHaveBeenCalledWith(pluginFilePath);
    });

    it('ファイルが存在しない場合でもエラーにならないこと', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));

      await expect(pluginService.deletePlugin()).resolves.not.toThrow();
    });
  });

  describe('reloadPlugin()', () => {
    it('キャッシュが正常にクリアされること', () => {
      expect(() => pluginService.reloadPlugin()).not.toThrow();
    });
  });

  describe('executeBeforeSmallDocumentReviewHook()', () => {
    const testContext = {
      documents: [
        {
          id: 'doc1',
          name: 'test.pdf',
          path: '/test/test.pdf',
          type: 'application/pdf',
          processMode: 'text' as const,
          textContent: 'test content',
        },
        {
          id: 'doc2',
          name: 'skip.pdf',
          path: '/test/skip.pdf',
          type: 'application/pdf',
          processMode: 'text' as const,
          textContent: '',
        },
      ],
      checklists: [{ id: 1, content: 'テストチェックリスト' }],
    };

    it('プラグインが存在しない場合、元のドキュメントを返すこと', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));

      const result =
        await pluginService.executeBeforeSmallDocumentReviewHook(testContext);

      expect(result).toEqual(testContext.documents);
    });

    it('フックが定義されていない場合、元のドキュメントを返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{}`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result =
        await pluginService.executeBeforeSmallDocumentReviewHook(testContext);

      expect(result).toEqual(testContext.documents);
    });

    it('フックが正常に実行され、フィルタリング結果を返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{
        beforeSmallDocumentReview: (ctx) => ctx.documents.filter((doc) => doc.name === 'test.pdf')
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result =
        await pluginService.executeBeforeSmallDocumentReviewHook(testContext);

      expect(result).toEqual([testContext.documents[0]]);
    });

    it('フック実行でエラーが発生した場合、元のドキュメントを返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{
        beforeSmallDocumentReview: () => { throw new Error('Hook error'); }
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result =
        await pluginService.executeBeforeSmallDocumentReviewHook(testContext);

      expect(result).toEqual(testContext.documents);
    });
  });

  describe('executeBeforeLargeDocumentReviewHook()', () => {
    const testContext = {
      document: {
        id: 'doc1',
        name: 'test.pdf',
        path: '/test/test.pdf',
        type: 'application/pdf',
        processMode: 'text' as const,
        textContent: 'test content',
      },
      checklists: [{ id: 1, content: 'テストチェックリスト' }],
    };

    it('プラグインが存在しない場合、元のドキュメントを返すこと', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));

      const result =
        await pluginService.executeBeforeLargeDocumentReviewHook(testContext);

      expect(result).toEqual(testContext.document);
    });

    it('フックがnullを返した場合、nullを返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{
        beforeLargeDocumentReview: () => null
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result =
        await pluginService.executeBeforeLargeDocumentReviewHook(testContext);

      expect(result).toBeNull();
    });
  });

  describe('executeChunkStrategyHook()', () => {
    const testContext = {
      document: {
        id: 'doc1',
        name: 'test.pdf',
        path: '/test/test.pdf',
        type: 'application/pdf',
        processMode: 'text' as const,
        textContent: 'test content',
      },
      splitCount: 3,
      retryCount: 0,
    };

    it('プラグインが存在しない場合、nullを返すこと', async () => {
      mockAccess.mockRejectedValueOnce(new Error('File not found'));

      const result = await pluginService.executeChunkStrategyHook(testContext);

      expect(result).toBeNull();
    });

    it('フックが定義されていない場合、nullを返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{}`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result = await pluginService.executeChunkStrategyHook(testContext);

      expect(result).toBeNull();
    });

    it('フックが正常に実行され、分割範囲を返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{
        chunkStrategy: () => [
          { start: 0, end: 100 },
          { start: 100, end: 200 },
          { start: 200, end: 300 }
        ]
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result = await pluginService.executeChunkStrategyHook(testContext);

      expect(result).toEqual([
        { start: 0, end: 100 },
        { start: 100, end: 200 },
        { start: 200, end: 300 },
      ]);
    });

    it('フック実行でエラーが発生した場合、nullを返すこと', async () => {
      const pluginCode = buildCommonJsPlugin(`{
        chunkStrategy: () => { throw new Error('Hook error'); }
      }`);
      mockReadFile.mockResolvedValueOnce(pluginCode);

      const result = await pluginService.executeChunkStrategyHook(testContext);

      expect(result).toBeNull();
    });
  });
});
