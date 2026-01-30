/**
 * @jest-environment node
 */

// Electron モックを最初に適用
jest.mock(
  'electron',
  () => require('../../test-utils/mockElectron').mockElectron,
);
jest.mock(
  'electron-store',
  () => require('../../test-utils/mockElectron').default,
);

// main.ts の初期化処理をスキップ
jest.mock('@/main/main', () => {
  const path = require('path');
  const os = require('os');
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test');
  return {
    getCustomAppDataDir: jest.fn(() => testAppData),
  };
});

// データベースアダプターのモック
jest.mock('@/adapter/db', () => ({
  getSettingsRepository: jest.fn(() => ({
    getSettings: jest.fn(() =>
      Promise.resolve({
        api: {
          key: 'test-key',
          url: 'https://api.test.com',
          model: 'gpt-4o',
          userId: 'test-user',
        },
      }),
    ),
  })),
  getSourceRepository: jest.fn(),
  getReviewRepository: jest.fn(),
}));

import { getTemperatureOption } from '@/mastra/lib/agentUtils';

describe('getTemperatureOption', () => {
  describe('正常系', () => {
    it('gpt-5モデルの場合、temperature:1が返される', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue({
          key: 'test-api-key',
          url: 'https://api.test.com',
          modelName: 'gpt-5',
          userId: 'test-user',
        }),
      };

      // Act
      const result = getTemperatureOption(mockRuntimeContext as any);

      // Assert
      expect(result).toEqual({ temperature: 1 });
    });

    it('gpt-4.1-miniモデルの場合、空オブジェクトが返される', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue({
          key: 'test-api-key',
          url: 'https://api.test.com',
          modelName: 'gpt-4.1-mini',
          userId: 'test-user',
        }),
      };

      // Act
      const result = getTemperatureOption(mockRuntimeContext as any);

      // Assert
      expect(result).toEqual({});
    });

    it('gpt-4oモデルの場合、空オブジェクトが返される', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue({
          key: 'test-api-key',
          url: 'https://api.test.com',
          modelName: 'gpt-4o',
          userId: 'test-user',
        }),
      };

      // Act
      const result = getTemperatureOption(mockRuntimeContext as any);

      // Assert
      expect(result).toEqual({});
    });
  });

  describe('異常系', () => {
    it('モデル情報がnullの場合、空オブジェクトが返される', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue(null),
      };

      // Act
      const result = getTemperatureOption(mockRuntimeContext as any);

      // Assert
      expect(result).toEqual({});
    });

    it('モデル情報がundefinedの場合、空オブジェクトが返される', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue(undefined),
      };

      // Act
      const result = getTemperatureOption(mockRuntimeContext as any);

      // Assert
      expect(result).toEqual({});
    });
  });
});
