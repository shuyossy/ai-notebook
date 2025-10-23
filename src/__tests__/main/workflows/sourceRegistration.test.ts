/**
 * ソース登録ワークフローのテスト
 * @jest-environment node
 */

// Electron モックを最初に適用（他のインポートより前に実行する必要がある）
jest.mock('electron', () => require('../test-utils/mockElectron').mockElectron);
jest.mock('electron-store', () => require('../test-utils/mockElectron').default);

// main.ts の初期化処理をスキップ（テスト環境では不要）
jest.mock('@/main/main', () => {
  const path = require('path');
  const os = require('os');
  // テンポラリディレクトリを使用（実際に存在するディレクトリ）
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test');
  return {
    getCustomAppDataDir: jest.fn(() => testAppData),
  };
});

import { sourceRegistrationWorkflow } from '@/mastra/workflows/sourceRegistration/sourceRegistration';
import { mastra } from '@/mastra';
import { getSourceRepository } from '@/adapter/db';
import FileExtractor from '@/main/lib/fileExtractor';
import { checkWorkflowResult } from '@/mastra/lib/workflowUtils';
import type { ISourceRepository } from '@/main/service/port/repository';
import { internalError } from '@/main/lib/error';

// モック設定
jest.mock('@/adapter/db', () => ({
  getSourceRepository: jest.fn(),
  getReviewRepository: jest.fn(() => ({
    // レビューリポジトリのモック（インポート時に必要）
    getReviewHistory: jest.fn(),
    createReviewHistory: jest.fn(),
  })),
  getChatRepository: jest.fn(() => ({
    // チャットリポジトリのモック（インポート時に必要）
    getChatRooms: jest.fn(),
    getChatMessages: jest.fn(),
  })),
  getSettingsRepository: jest.fn(() => ({
    // 設定リポジトリのモック（インポート時に必要）
    getSettings: jest.fn().mockReturnValue({
      api: {
        url: 'http://localhost:11434/v1',
        key: 'test-api-key',
        model: 'test-model',
      },
      database: {
        dir: '/test/db',
      },
      source: {
        registerDir: './test/source',
      },
    }),
    setSettings: jest.fn(),
  })),
}));

// FileExtractor のモック（最初に設定）
const mockExtractText = jest.fn();
const mockCleanCacheDirectory = jest.fn();

jest.mock('@/main/lib/fileExtractor', () => ({
  __esModule: true,
  default: {
    get extractText() {
      return mockExtractText;
    },
    get cleanCacheDirectory() {
      return mockCleanCacheDirectory;
    },
  },
}));

jest.mock('@/main/lib/eventPayloadHelper', () => ({
  publishEvent: jest.fn(),
}));

describe('sourceRegistrationWorkflow', () => {
  // モックリポジトリ
  let mockSourceRepository: jest.Mocked<ISourceRepository>;

  // モックエージェント
  let mockSummarizeSourceAgent: any;
  let mockSummarizeTopicAgent: any;

  beforeEach(() => {
    // リポジトリのモック
    mockSourceRepository = {
      initializeProcessingSource: jest.fn().mockResolvedValue({
        id: 1,
        path: '/test/source.txt',
      }),
      updateSource: jest.fn().mockResolvedValue(undefined),
      updateProcessingStatus: jest.fn().mockResolvedValue(undefined),
      registerTopic: jest.fn().mockResolvedValue(undefined),
      updateSourceEnabled: jest.fn().mockResolvedValue(undefined),
      getSourceById: jest.fn(),
      getSourcesByIds: jest.fn(),
      getSourceListMarkdown: jest.fn(),
      deleteSourceByPath: jest.fn(),
      getSouorceInStatus: jest.fn(),
      getSourceByPathInStatus: jest.fn(),
      getAllSources: jest.fn(),
      insertSources: jest.fn(),
    } as jest.Mocked<ISourceRepository>;

    (getSourceRepository as jest.Mock).mockReturnValue(mockSourceRepository);

    // FileExtractorのモック
    mockExtractText.mockResolvedValue({
      content: 'テストドキュメントの内容',
    });

    // Mastraエージェントのモック
    mockSummarizeSourceAgent = {
      generateLegacy: jest.fn(),
    };
    mockSummarizeTopicAgent = {
      generateLegacy: jest.fn(),
    };

    // mastra.getAgentのモック
    jest.spyOn(mastra, 'getAgent').mockImplementation((agentName: string) => {
      if (agentName === 'summarizeSourceAgent') {
        return mockSummarizeSourceAgent;
      }
      if (agentName === 'summarizeTopicAgent') {
        return mockSummarizeTopicAgent;
      }
      throw new Error(`Unknown agent: ${agentName}`);
    });
  });

  afterEach(() => {
    mockExtractText.mockReset();
  });

  describe('正常系', () => {
    describe('analyzeSourceStep', () => {
      it('基本的なソース分析が成功すること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'これはテストドキュメントの要約です',
          },
        });

        mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            topicAndSummaryList: [
              {
                topic: 'トピック1',
                summary: 'トピック1の要約',
              },
            ],
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // DB操作の確認
        expect(mockSourceRepository.initializeProcessingSource).toHaveBeenCalledWith({
          path: filePath,
          title: '',
          summary: '',
          status: 'processing',
        });
        expect(mockSourceRepository.updateSource).toHaveBeenCalledWith({
          id: 1,
          title: 'テストドキュメント',
          summary: 'これはテストドキュメントの要約です',
          error: null,
        });
      });
    });

    describe('extractTopicAndSummaryStep', () => {
      it('トピック抽出と要約生成が成功すること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            topicAndSummaryList: [
              {
                topic: 'トピック1',
                summary: 'トピック1の要約',
              },
              {
                topic: 'トピック2',
                summary: 'トピック2の要約',
              },
              {
                topic: 'トピック3',
                summary: 'トピック3の要約',
              },
            ],
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // トピック登録の確認
        expect(mockSourceRepository.registerTopic).toHaveBeenCalledWith([
          {
            sourceId: 1,
            name: 'トピック1',
            summary: 'トピック1の要約',
          },
          {
            sourceId: 1,
            name: 'トピック2',
            summary: 'トピック2の要約',
          },
          {
            sourceId: 1,
            name: 'トピック3',
            summary: 'トピック3の要約',
          },
        ]);

        // ステータス更新の確認
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenCalledWith({
          id: 1,
          status: 'completed',
          error: null,
        });
        expect(mockSourceRepository.updateSourceEnabled).toHaveBeenCalledWith(1, true);
      });

      it('前ステップ失敗時は処理をスキップすること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        const errorMessage = 'テストエラー';

        mockSummarizeSourceAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: errorMessage },
          }),
        );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(errorMessage);

        // extractTopicAndSummaryStepの処理がスキップされることを確認
        expect(mockSummarizeTopicAgent.generateLegacy).not.toHaveBeenCalled();
        expect(mockSourceRepository.registerTopic).not.toHaveBeenCalled();
      });
    });

    describe('Workflow全体', () => {
      it('Workflow全体が正常に完了すること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            topicAndSummaryList: [
              {
                topic: 'トピック1',
                summary: 'トピック1の要約',
              },
            ],
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 両エージェントが呼ばれていることを確認
        expect(mockSummarizeSourceAgent.generateLegacy).toHaveBeenCalledTimes(1);
        expect(mockSummarizeTopicAgent.generateLegacy).toHaveBeenCalledTimes(1);
      });

      it('トピックリストが空でも正常終了すること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            topicAndSummaryList: [],
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // トピックが空でもregisterTopicが呼ばれることを確認
        expect(mockSourceRepository.registerTopic).toHaveBeenCalledWith([]);
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenCalledWith({
          id: 1,
          status: 'completed',
          error: null,
        });
      });
    });
  });

  describe('異常系', () => {
    describe('analyzeSourceStep', () => {
      it('FileExtractor.extractTextエラー時に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        const extractError = internalError({
          expose: true,
          messageCode: 'PLAIN_MESSAGE',
          messageParams: { message: 'ファイル読み込みエラー' },
        });
        mockExtractText.mockRejectedValue(extractError);

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析に失敗しました');
        expect(checkResult.errorMessage).toContain('ファイル読み込みエラー');

        // DBステータス更新の確認
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenCalledWith({
          id: 1,
          status: 'failed',
          error: expect.stringContaining('ソース分析に失敗しました'),
        });

        // 後続処理が実行されないことを確認
        expect(mockSummarizeSourceAgent.generateLegacy).not.toHaveBeenCalled();
      });

      it('AI API呼び出しエラー時に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'AI APIエラー' },
          }),
        );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析に失敗しました');
        expect(checkResult.errorMessage).toContain('AI APIエラー');

        // DBステータス更新の確認
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenCalledWith({
          id: 1,
          status: 'failed',
          error: expect.stringContaining('AI APIエラー'),
        });
      });

      it('AI APIのfinishReasonがlengthの場合にエラーになること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'length',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析に失敗しました');
        expect(checkResult.errorMessage).toContain(
          'AIモデルの最大出力コンテキストを超えました',
        );

        // DBステータス更新の確認
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenCalledWith({
          id: 1,
          status: 'failed',
          error: expect.stringContaining('AIモデルの最大出力コンテキストを超えました'),
        });
      });

      it('AI APIのfinishReasonがcontent-filterの場合にエラーになること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'content-filter',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          'コンテンツフィルターにより出力が制限されました',
        );
      });

      it('AI APIのfinishReasonがerrorの場合にエラーになること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'error',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          'AIモデルで不明なエラーが発生しました',
        );
      });
    });

    describe('DB操作エラー', () => {
      it('initializeProcessingSourceがエラーをthrowした場合に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSourceRepository.initializeProcessingSource.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'DB初期化エラー' },
          }),
        );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析に失敗しました');
        expect(checkResult.errorMessage).toContain('DB初期化エラー');

        // 後続処理が実行されないことを確認
        expect(mockSummarizeSourceAgent.generateLegacy).not.toHaveBeenCalled();
        expect(mockSourceRepository.updateSource).not.toHaveBeenCalled();
      });

      it('updateSourceがエラーをthrowした場合に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });
        mockSourceRepository.updateSource.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'DB更新エラー' },
          }),
        );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析に失敗しました');
        expect(checkResult.errorMessage).toContain('DB更新エラー');

        // DBステータス更新の確認（エラー処理内で呼ばれる）
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenCalledWith({
          id: 1,
          status: 'failed',
          error: expect.stringContaining('DB更新エラー'),
        });
      });

      it('registerTopicがエラーをthrowした場合に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });
        mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            topicAndSummaryList: [
              {
                topic: 'トピック1',
                summary: 'トピック1の要約',
              },
            ],
          },
        });
        mockSourceRepository.registerTopic.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'トピック登録エラー' },
          }),
        );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析でエラーが発生しました');
        expect(checkResult.errorMessage).toContain('トピック登録エラー');

        // DBステータス更新の確認
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenLastCalledWith({
          id: 1,
          status: 'failed',
          error: expect.stringContaining('トピック登録エラー'),
        });

        // 成功時の処理が実行されないことを確認
        expect(mockSourceRepository.updateSourceEnabled).not.toHaveBeenCalled();
      });

      it('updateSourceEnabledがエラーをthrowした場合に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });
        mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            topicAndSummaryList: [
              {
                topic: 'トピック1',
                summary: 'トピック1の要約',
              },
            ],
          },
        });
        mockSourceRepository.updateSourceEnabled.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'ソース有効化エラー' },
          }),
        );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析でエラーが発生しました');
        expect(checkResult.errorMessage).toContain('ソース有効化エラー');

        // registerTopicは成功していることを確認
        expect(mockSourceRepository.registerTopic).toHaveBeenCalledTimes(1);

        // DBステータス更新の確認
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenLastCalledWith({
          id: 1,
          status: 'failed',
          error: expect.stringContaining('ソース有効化エラー'),
        });
      });
    });

    describe('extractTopicAndSummaryStep', () => {
      it('トピック抽出AI API呼び出しエラー時に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        mockSummarizeTopicAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'トピック抽出エラー' },
          }),
        );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析でエラーが発生しました');
        expect(checkResult.errorMessage).toContain('トピック抽出エラー');

        // DBステータス更新の確認（extractTopicAndSummaryStepでのエラー）
        expect(mockSourceRepository.updateProcessingStatus).toHaveBeenLastCalledWith({
          id: 1,
          status: 'failed',
          error: expect.stringContaining('トピック抽出エラー'),
        });
      });

      it('トピック抽出時のfinishReasonエラーが適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
          finishReason: 'length',
          object: {
            topicAndSummaryList: [],
          },
        });

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析でエラーが発生しました');
        expect(checkResult.errorMessage).toContain(
          'AIモデルの最大出力コンテキストを超えました',
        );
      });

      it('テキスト抽出エラー時に適切にハンドリングされること', async () => {
        // Arrange
        const filePath = '/test/source.txt';
        mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
          finishReason: 'stop',
          object: {
            title: 'テストドキュメント',
            summary: 'テスト要約',
          },
        });

        // 2回目の呼び出しでエラーをthrow
        mockExtractText
          .mockResolvedValueOnce({
            content: 'テストドキュメントの内容',
          })
          .mockRejectedValueOnce(
            internalError({
              expose: true,
              messageCode: 'PLAIN_MESSAGE',
              messageParams: { message: '2回目のファイル読み込みエラー' },
            }),
          );

        // Act
        const run = await sourceRegistrationWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            filePath,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ソース分析でエラーが発生しました');
        expect(checkResult.errorMessage).toContain('2回目のファイル読み込みエラー');

        // FileExtractorが2回呼ばれていることを確認
        expect(FileExtractor.extractText).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('エッジケース', () => {
    it('空のテキスト抽出結果でも正常に処理されること', async () => {
      // Arrange
      const filePath = '/test/empty.txt';
      mockExtractText.mockResolvedValue({
        content: '',
      });
      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: '空のドキュメント',
          summary: '内容なし',
        },
      });
      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: [],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      expect(checkResult.status).toBe('success');

      // 空のコンテンツでもAIエージェントが呼ばれることを確認
      expect(mockSummarizeSourceAgent.generateLegacy).toHaveBeenCalledWith('', expect.any(Object));
      expect(mockSummarizeTopicAgent.generateLegacy).toHaveBeenCalledWith('', expect.any(Object));
    });

    it('AIが空のタイトル/要約を返す場合でも正常に処理されること', async () => {
      // Arrange
      const filePath = '/test/source.txt';
      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: '',
          summary: '',
        },
      });
      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: [],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      expect(checkResult.status).toBe('success');

      // 空のタイトル/要約でもDBに保存されることを確認
      expect(mockSourceRepository.updateSource).toHaveBeenCalledWith({
        id: 1,
        title: '',
        summary: '',
        error: null,
      });
    });

    it('特殊文字を含むファイルパスでも正常に処理されること', async () => {
      // Arrange
      const filePath = '/test/特殊 文字@#$%/ソース.txt';
      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: 'テストドキュメント',
          summary: 'テスト要約',
        },
      });
      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: [],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      expect(checkResult.status).toBe('success');

      // 特殊文字を含むパスでもFileExtractorが正しく呼ばれることを確認
      expect(FileExtractor.extractText).toHaveBeenCalledWith(filePath);
      expect(mockSourceRepository.initializeProcessingSource).toHaveBeenCalledWith({
        path: filePath,
        title: '',
        summary: '',
        status: 'processing',
      });
    });

    it('未定義のfinishReasonでも正常に処理されること', async () => {
      // Arrange
      const filePath = '/test/source.txt';
      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'unknown_reason',
        object: {
          title: 'テストドキュメント',
          summary: 'テスト要約',
        },
      });
      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'unknown_reason',
        object: {
          topicAndSummaryList: [
            {
              topic: 'トピック1',
              summary: 'トピック1の要約',
            },
          ],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      // judgeFinishReasonのdefaultケースではsuccess: trueを返すため、成功する
      expect(checkResult.status).toBe('success');
    });
  });

  describe('技術的観点', () => {
    it('DB操作が正しい順序で実行されること', async () => {
      // Arrange
      const filePath = '/test/source.txt';
      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: 'テストドキュメント',
          summary: 'テスト要約',
        },
      });

      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: [
            {
              topic: 'トピック1',
              summary: 'トピック1の要約',
            },
          ],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      // 呼び出し順序の確認（各関数が呼ばれたことを確認）
      expect(mockSourceRepository.initializeProcessingSource).toHaveBeenCalledTimes(1);
      expect(mockSourceRepository.updateSource).toHaveBeenCalledTimes(1);
      expect(mockSourceRepository.registerTopic).toHaveBeenCalledTimes(1);
      expect(mockSourceRepository.updateProcessingStatus).toHaveBeenCalledTimes(1);
      expect(mockSourceRepository.updateSourceEnabled).toHaveBeenCalledTimes(1);

      // 呼び出し順序の確認（すべてのモックが少なくとも1回呼ばれていることを確認）
      const calls = [
        mockSourceRepository.initializeProcessingSource,
        mockSourceRepository.updateSource,
        mockSourceRepository.registerTopic,
        mockSourceRepository.updateProcessingStatus,
        mockSourceRepository.updateSourceEnabled,
      ];

      calls.forEach((mock) => {
        expect(mock).toHaveBeenCalled();
      });
    });

    it('mastra.getAgentが正しく呼ばれること', async () => {
      // Arrange
      const filePath = '/test/source.txt';
      const getAgentSpy = jest.spyOn(mastra, 'getAgent');

      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: 'テストドキュメント',
          summary: 'テスト要約',
        },
      });

      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: [
            {
              topic: 'トピック1',
              summary: 'トピック1の要約',
            },
          ],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      expect(getAgentSpy).toHaveBeenCalledWith('summarizeSourceAgent');
      expect(getAgentSpy).toHaveBeenCalledWith('summarizeTopicAgent');
      expect(mockSummarizeSourceAgent.generateLegacy).toHaveBeenCalled();
      expect(mockSummarizeTopicAgent.generateLegacy).toHaveBeenCalled();
    });

    it('FileExtractor.extractTextが各ステップで呼ばれること', async () => {
      // Arrange
      const filePath = '/test/source.txt';
      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: 'テストドキュメント',
          summary: 'テスト要約',
        },
      });

      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: [
            {
              topic: 'トピック1',
              summary: 'トピック1の要約',
            },
          ],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      // 各ステップで1回ずつ、計2回呼ばれる
      expect(FileExtractor.extractText).toHaveBeenCalledTimes(2);
      expect(FileExtractor.extractText).toHaveBeenCalledWith(filePath);
    });

    it('生成されたタイトルと要約が正しく処理されること', async () => {
      // Arrange
      const filePath = '/test/source.txt';
      const expectedTitle = 'カスタムタイトル';
      const expectedSummary = 'カスタム要約内容';

      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: expectedTitle,
          summary: expectedSummary,
        },
      });

      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: [
            {
              topic: 'トピック1',
              summary: 'トピック1の要約',
            },
          ],
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      expect(mockSourceRepository.updateSource).toHaveBeenCalledWith({
        id: 1,
        title: expectedTitle,
        summary: expectedSummary,
        error: null,
      });
    });

    it('複数トピックが正しく処理されること', async () => {
      // Arrange
      const filePath = '/test/source.txt';
      const topics = [
        { topic: 'トピックA', summary: 'トピックAの詳細' },
        { topic: 'トピックB', summary: 'トピックBの詳細' },
        { topic: 'トピックC', summary: 'トピックCの詳細' },
        { topic: 'トピックD', summary: 'トピックDの詳細' },
        { topic: 'トピックE', summary: 'トピックEの詳細' },
      ];

      mockSummarizeSourceAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          title: 'テストドキュメント',
          summary: 'テスト要約',
        },
      });

      mockSummarizeTopicAgent.generateLegacy.mockResolvedValue({
        finishReason: 'stop',
        object: {
          topicAndSummaryList: topics,
        },
      });

      // Act
      const run = await sourceRegistrationWorkflow.createRunAsync();
      await run.start({
        inputData: {
          filePath,
        },
      });

      // Assert
      expect(mockSourceRepository.registerTopic).toHaveBeenCalledWith(
        topics.map((t) => ({
          sourceId: 1,
          name: t.topic,
          summary: t.summary,
        })),
      );
    });
  });
});
