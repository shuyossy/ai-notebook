/**
 * PluginApi のテスト
 */

import { PluginApi } from '@/renderer/service/pluginApi';
import type { PluginInfo } from '@/types/plugin';

// invokeApi のモック
const mockInvokeApi = jest.fn();
jest.mock('@/renderer/lib/apiUtils', () => ({
  invokeApi: (fn: () => any, options?: any) => mockInvokeApi(fn, options),
}));

// window.electron.plugin のモック
const mockUpload = jest.fn();
const mockGetInfo = jest.fn();
const mockDelete = jest.fn();
const mockReload = jest.fn();

describe('PluginApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // シングルトンをリセット
    (PluginApi as any).instance = undefined;

    // window.electron.plugin を設定
    (window as any).electron = {
      plugin: {
        upload: mockUpload,
        getInfo: mockGetInfo,
        delete: mockDelete,
        reload: mockReload,
      },
    };
  });

  describe('シングルトンパターン', () => {
    it('getInstance()が同一インスタンスを返すこと', () => {
      const instance1 = PluginApi.getInstance();
      const instance2 = PluginApi.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('uploadPlugin()', () => {
    it('IPC通信を正しく呼び出すこと', async () => {
      const testFilePath = '/test/plugin.js';
      const testOptions = { showAlert: true, throwError: true };

      mockInvokeApi.mockImplementation(async (fn) => {
        return await fn();
      });

      const api = PluginApi.getInstance();
      await api.uploadPlugin(testFilePath, testOptions);

      expect(mockInvokeApi).toHaveBeenCalledTimes(1);
      expect(mockInvokeApi).toHaveBeenCalledWith(
        expect.any(Function),
        testOptions,
      );

      // IPC通信の関数が正しく呼ばれるかを確認
      expect(mockUpload).toHaveBeenCalledWith(testFilePath);
    });

    it('invokeApiが正しいオプションで呼ばれること', async () => {
      const testFilePath = '/test/plugin.js';
      const testOptions = { showAlert: false, throwError: false };

      mockInvokeApi.mockImplementation(async (fn) => {
        return await fn();
      });

      const api = PluginApi.getInstance();
      await api.uploadPlugin(testFilePath, testOptions);

      expect(mockInvokeApi).toHaveBeenCalledWith(
        expect.any(Function),
        testOptions,
      );
      expect(mockUpload).toHaveBeenCalledWith(testFilePath);
    });
  });

  describe('getPluginInfo()', () => {
    it('IPC通信を正しく呼び出すこと', async () => {
      const testOptions = { showAlert: false, throwError: false };
      const testPluginInfo: PluginInfo = {
        name: 'test-plugin',
        version: '1.0.0',
        filePath: '/test/plugin.js',
        availableHooks: ['beforeSmallDocumentReview'],
      };

      mockInvokeApi.mockImplementation(async (fn) => {
        return await fn();
      });
      mockGetInfo.mockResolvedValue({ success: true, data: testPluginInfo });

      const api = PluginApi.getInstance();
      await api.getPluginInfo(testOptions);

      expect(mockInvokeApi).toHaveBeenCalledTimes(1);
      expect(mockInvokeApi).toHaveBeenCalledWith(
        expect.any(Function),
        testOptions,
      );

      // IPC通信の関数が正しく呼ばれるかを確認
      expect(mockGetInfo).toHaveBeenCalledTimes(1);
    });

    it('プラグイン情報を正しく返すこと', async () => {
      const testPluginInfo: PluginInfo = {
        name: 'test-plugin',
        version: '1.0.0',
        filePath: '/test/plugin.js',
        availableHooks: ['beforeSmallDocumentReview', 'chunkStrategy'],
      };

      mockInvokeApi.mockResolvedValue(testPluginInfo);

      const api = PluginApi.getInstance();
      const result = await api.getPluginInfo();

      expect(result).toEqual(testPluginInfo);
    });

    it('nullを正しく返すこと', async () => {
      mockInvokeApi.mockResolvedValue(null);

      const api = PluginApi.getInstance();
      const result = await api.getPluginInfo();

      expect(result).toBeNull();
    });
  });

  describe('deletePlugin()', () => {
    it('IPC通信を正しく呼び出すこと', async () => {
      const testOptions = { showAlert: true, throwError: true };

      mockInvokeApi.mockImplementation(async (fn) => {
        return await fn();
      });

      const api = PluginApi.getInstance();
      await api.deletePlugin(testOptions);

      expect(mockInvokeApi).toHaveBeenCalledTimes(1);
      expect(mockInvokeApi).toHaveBeenCalledWith(
        expect.any(Function),
        testOptions,
      );

      // IPC通信の関数が正しく呼ばれるかを確認
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('reloadPlugin()', () => {
    it('IPC通信を正しく呼び出すこと', async () => {
      const testOptions = { showAlert: false, throwError: true };

      mockInvokeApi.mockImplementation(async (fn) => {
        return await fn();
      });

      const api = PluginApi.getInstance();
      await api.reloadPlugin(testOptions);

      expect(mockInvokeApi).toHaveBeenCalledTimes(1);
      expect(mockInvokeApi).toHaveBeenCalledWith(
        expect.any(Function),
        testOptions,
      );

      // IPC通信の関数が正しく呼ばれるかを確認
      expect(mockReload).toHaveBeenCalledTimes(1);
    });
  });
});
