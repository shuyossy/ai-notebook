/**
 * @jest-environment node
 */
import { getModel } from '@/mastra/agents/model';

// モック用のchatModelとモデル関数
const mockChatModel = jest.fn();
const mockOpenAIModel = jest.fn();

// モック設定
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn().mockImplementation(({ name }) => ({
    chatModel: mockChatModel.mockReturnValue({ id: `${name}-chat-model` }),
  })),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest
    .fn()
    .mockImplementation(({ name }) =>
      mockOpenAIModel.mockReturnValue({ id: `${name}-model` }),
    ),
}));

// モジュールの再インポートでモックを適用
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';

describe('getModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    it('gpt-4.1-miniを選択した場合、OpenAICompatibleModelが返される', () => {
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
      const result = getModel({ runtimeContext: mockRuntimeContext as any });

      // Assert
      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: 'openAICompatibleModel_gpt4.1-mini',
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com',
      });
      expect(mockChatModel).toHaveBeenCalledWith('openai/gpt-4.1-mini');
      expect(result).toEqual({
        id: 'openAICompatibleModel_gpt4.1-mini-chat-model',
      });
    });

    it('gpt-4oを選択した場合、OpenAICompatibleModelが返される', () => {
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
      const result = getModel({ runtimeContext: mockRuntimeContext as any });

      // Assert
      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: 'openAICompatibleModel_gpt4o',
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com',
      });
      expect(mockChatModel).toHaveBeenCalledWith('openai/gpt-4o');
      expect(result).toEqual({ id: 'openAICompatibleModel_gpt4o-chat-model' });
    });

    it('gpt-5を選択した場合、OpenAIモデルが返される', () => {
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
      const result = getModel({ runtimeContext: mockRuntimeContext as any });

      // Assert
      expect(createOpenAI).toHaveBeenCalledWith({
        name: 'openAI_gpt5',
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com',
      });
      expect(mockOpenAIModel).toHaveBeenCalledWith('openai/gpt-5');
      expect(result).toEqual({ id: 'openAI_gpt5-model' });
    });
  });

  describe('異常系', () => {
    it('モデル設定が不足している場合、エラーがスローされる', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue(null),
      };

      // Act & Assert
      expect(() =>
        getModel({ runtimeContext: mockRuntimeContext as any }),
      ).toThrow(
        'AI APIの設定が正しくありません。APIキー、URL、モデル名を確認してください。',
      );
    });

    it('APIキーが不足している場合、エラーがスローされる', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue({
          key: '',
          url: 'https://api.test.com',
          modelName: 'gpt-4o',
          userId: 'test-user',
        }),
      };

      // Act & Assert
      expect(() =>
        getModel({ runtimeContext: mockRuntimeContext as any }),
      ).toThrow(
        'AI APIの設定が正しくありません。APIキー、URL、モデル名を確認してください。',
      );
    });

    it('URLが不足している場合、エラーがスローされる', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue({
          key: 'test-api-key',
          url: '',
          modelName: 'gpt-4o',
          userId: 'test-user',
        }),
      };

      // Act & Assert
      expect(() =>
        getModel({ runtimeContext: mockRuntimeContext as any }),
      ).toThrow(
        'AI APIの設定が正しくありません。APIキー、URL、モデル名を確認してください。',
      );
    });

    it('モデル名が不足している場合、エラーがスローされる', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue({
          key: 'test-api-key',
          url: 'https://api.test.com',
          modelName: '',
          userId: 'test-user',
        }),
      };

      // Act & Assert
      expect(() =>
        getModel({ runtimeContext: mockRuntimeContext as any }),
      ).toThrow(
        'AI APIの設定が正しくありません。APIキー、URL、モデル名を確認してください。',
      );
    });

    it('無効なモデル名の場合、エラーがスローされる', () => {
      // Arrange
      const mockRuntimeContext = {
        get: jest.fn().mockReturnValue({
          key: 'test-api-key',
          url: 'https://api.test.com',
          modelName: 'invalid-model',
          userId: 'test-user',
        }),
      };

      // Act & Assert
      expect(() =>
        getModel({ runtimeContext: mockRuntimeContext as any }),
      ).toThrow('無効なモデル名です: invalid-model');
    });
  });
});
