/**
 * チェックリスト抽出ワークフローのテスト
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

import { checklistExtractionWorkflow } from '@/mastra/workflows/sourceReview/checklistExtraction';
import { mastra } from '@/mastra';
import { getReviewRepository } from '@/adapter/db';
import FileExtractor from '@/main/lib/fileExtractor';
import { checkWorkflowResult } from '@/mastra/lib/workflowUtils';
import type { IReviewRepository } from '@/main/service/port/repository';
import type { UploadFile } from '@/types';
import { internalError } from '@/main/lib/error';

// モック設定
jest.mock('@/adapter/db', () => ({
  getReviewRepository: jest.fn(),
  getSourceRepository: jest.fn(() => ({
    // 必要最小限のモック（ソースリポジトリは直接使用しないが、インポート時に呼ばれる）
    getAllSources: jest.fn(),
    getSourceById: jest.fn(),
    createSource: jest.fn(),
    updateSource: jest.fn(),
    deleteSource: jest.fn(),
    updateSourceEnabled: jest.fn(),
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

describe('checklistExtractionWorkflow', () => {
  // モックリポジトリ
  let mockRepository: jest.Mocked<IReviewRepository>;

  // モックエージェント
  let mockChecklistExtractionAgent: any;
  let mockTopicExtractionAgent: any;
  let mockTopicChecklistAgent: any;

  beforeEach(() => {
    // リポジトリのモック
    mockRepository = {
      deleteSystemCreatedChecklists: jest.fn().mockResolvedValue(undefined),
      createChecklist: jest.fn().mockResolvedValue(undefined),
      getReviewHistory: jest.fn().mockResolvedValue({ id: 'review-1' }),
      createReviewHistory: jest.fn(),
      getAllReviewHistories: jest.fn(),
      updateReviewHistoryTitle: jest.fn(),
      updateReviewHistoryAdditionalInstructionsAndCommentFormat: jest.fn(),
      updateReviewHistoryEvaluationSettings: jest.fn(),
      updateReviewHistoryProcessingStatus: jest.fn(),
      updateReviewHistoryTargetDocumentName: jest.fn(),
      deleteReviewHistory: jest.fn(),
      getChecklists: jest.fn(),
      updateChecklist: jest.fn(),
      deleteChecklist: jest.fn(),
      upsertReviewResult: jest.fn(),
      getReviewChecklistResults: jest.fn(),
      deleteAllReviewResults: jest.fn(),
      deleteReviewDocumentCaches: jest.fn(),
      deleteReviewLargedocumentResultCaches: jest.fn(),
      updateReviewHistoryDocumentMode: jest.fn(),
      createReviewDocumentCache: jest.fn(),
      getReviewDocumentCaches: jest.fn(),
      getReviewDocumentCacheById: jest.fn(),
      getReviewDocumentCacheByIds: jest.fn(),
      createReviewLargedocumentResultCache: jest.fn(),
      getReviewLargedocumentResultCaches: jest.fn(),
      getMaxTotalChunksForDocument: jest.fn(),
      getChecklistResultsWithIndividualResults: jest.fn(),
    } as jest.Mocked<IReviewRepository>;

    (getReviewRepository as jest.Mock).mockReturnValue(mockRepository);

    // FileExtractorのモック
    mockExtractText.mockResolvedValue({
      content: 'テストファイルの内容',
    });

    // Mastraエージェントのモック
    mockChecklistExtractionAgent = {
      generateLegacy: jest.fn(),
    };
    mockTopicExtractionAgent = {
      generateLegacy: jest.fn(),
    };
    mockTopicChecklistAgent = {
      generateLegacy: jest.fn(),
    };

    // mastra.getAgentのモック
    jest.spyOn(mastra, 'getAgent').mockImplementation((agentName: string) => {
      if (agentName === 'checklistExtractionAgent') {
        return mockChecklistExtractionAgent;
      }
      if (agentName === 'topicExtractionAgent') {
        return mockTopicExtractionAgent;
      }
      if (agentName === 'topicChecklistAgent') {
        return mockTopicChecklistAgent;
      }
      throw new Error(`Unknown agent: ${agentName}`);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockExtractText.mockReset();
  });

  describe('チェックリストドキュメント（AI抽出）', () => {
    describe('正常系', () => {
      it('基本的なチェックリスト抽出が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'checklist.pdf',
            path: '/test/checklist.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            isChecklistDocument: true,
            newChecklists: [
              'チェック項目1',
              'チェック項目2',
              'チェック項目3',
            ],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'checklist-ai',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockRepository.deleteSystemCreatedChecklists).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(mockRepository.createChecklist).toHaveBeenCalledTimes(3);
        expect(mockRepository.createChecklist).toHaveBeenCalledWith(
          reviewHistoryId,
          'チェック項目1',
          'system',
        );
        expect(mockRepository.createChecklist).toHaveBeenCalledWith(
          reviewHistoryId,
          'チェック項目2',
          'system',
        );
        expect(mockRepository.createChecklist).toHaveBeenCalledWith(
          reviewHistoryId,
          'チェック項目3',
          'system',
        );
      });

      it('複数ファイルの統合抽出が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'checklist1.pdf',
            path: '/test/checklist1.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
          {
            id: 'file-2',
            name: 'checklist2.pdf',
            path: '/test/checklist2.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            isChecklistDocument: true,
            newChecklists: ['統合チェック項目1', '統合チェック項目2'],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'checklist-ai',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(FileExtractor.extractText).toHaveBeenCalledTimes(2);
        expect(mockChecklistExtractionAgent.generateLegacy).toHaveBeenCalledTimes(
          1,
        );

        // generateLegacyに渡されたメッセージを確認
        const callArgs = mockChecklistExtractionAgent.generateLegacy.mock.calls[0];
        const message = callArgs[0];
        expect(message.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('checklist1.pdf, checklist2.pdf'),
            }),
          ]),
        );
      });

      it('画像モード（ページ別）での抽出が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'checklist.pdf',
            path: '/test/checklist.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'pages',
            imageData: [
              'data:image/png;base64,page1data',
              'data:image/png;base64,page2data',
            ],
          },
        ];

        mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            isChecklistDocument: true,
            newChecklists: ['画像から抽出した項目1', '画像から抽出した項目2'],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'checklist-ai',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // FileExtractor.extractTextが呼ばれないことを確認
        expect(FileExtractor.extractText).not.toHaveBeenCalled();

        // generateLegacyに画像データが含まれることを確認
        const callArgs = mockChecklistExtractionAgent.generateLegacy.mock.calls[0];
        const message = callArgs[0];
        expect(message.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('Page 1/2'),
            }),
            expect.objectContaining({
              type: 'image',
              image: 'data:image/png;base64,page1data',
              mimeType: 'image/png',
            }),
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('Page 2/2'),
            }),
            expect.objectContaining({
              type: 'image',
              image: 'data:image/png;base64,page2data',
              mimeType: 'image/png',
            }),
          ]),
        );
      });

      it('画像モード（統合）での抽出が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'checklist.pdf',
            path: '/test/checklist.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'merged',
            imageData: ['data:image/png;base64,mergeddata'],
          },
        ];

        mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            isChecklistDocument: true,
            newChecklists: ['統合画像から抽出した項目'],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'checklist-ai',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // generateLegacyに統合画像データが含まれることを確認
        const callArgs = mockChecklistExtractionAgent.generateLegacy.mock.calls[0];
        const message = callArgs[0];
        expect(message.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('Page 1/1'),
            }),
            expect.objectContaining({
              type: 'image',
              image: 'data:image/png;base64,mergeddata',
              mimeType: 'image/png',
            }),
          ]),
        );
      });
    });

    describe('異常系', () => {
      it('チェックリストドキュメントでないファイルでエラーになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            isChecklistDocument: false,
            newChecklists: [],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'checklist-ai',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          'チェックリスト抽出に適さないドキュメント',
        );
        expect(mockRepository.createChecklist).not.toHaveBeenCalled();
      });

      it('チェックリスト項目が抽出されない場合にエラーになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'empty.pdf',
            path: '/test/empty.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            isChecklistDocument: true,
            newChecklists: [],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'checklist-ai',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          'チェックリストが抽出されませんでした',
        );
        expect(mockRepository.createChecklist).not.toHaveBeenCalled();
      });

      it('AI API呼び出しエラー時に適切にハンドリングされること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'checklist.pdf',
            path: '/test/checklist.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockChecklistExtractionAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'テストエラー' },
          }),
        );

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'checklist-ai',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toBe('テストエラー');
        expect(mockRepository.createChecklist).not.toHaveBeenCalled();
      });
    });
  });

  describe('一般ドキュメント', () => {
    describe('正常系', () => {
      it('トピック抽出とチェックリスト作成が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];
        const checklistRequirements = 'セキュリティに関する項目を作成してください';

        mockTopicExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            topics: [
              {
                topic: 'セキュリティ対策',
                reason: 'セキュリティは重要',
              },
              {
                topic: 'データ保護',
                reason: 'データ保護は必須',
              },
            ],
          },
        });

        mockTopicChecklistAgent.generateLegacy
          .mockResolvedValueOnce({
            object: {
              checklistItems: [
                {
                  checklistItem: 'セキュリティ項目1',
                  reason: '理由1',
                },
                {
                  checklistItem: 'セキュリティ項目2',
                  reason: '理由2',
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            object: {
              checklistItems: [
                {
                  checklistItem: 'データ保護項目1',
                  reason: '理由3',
                },
              ],
            },
          });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'general',
            checklistRequirements,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockRepository.deleteSystemCreatedChecklists).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(mockTopicExtractionAgent.generateLegacy).toHaveBeenCalledTimes(1);
        expect(mockTopicChecklistAgent.generateLegacy).toHaveBeenCalledTimes(2);
        expect(mockRepository.createChecklist).toHaveBeenCalledTimes(3);
        expect(mockRepository.createChecklist).toHaveBeenCalledWith(
          reviewHistoryId,
          'セキュリティ項目1',
          'system',
        );
        expect(mockRepository.createChecklist).toHaveBeenCalledWith(
          reviewHistoryId,
          'セキュリティ項目2',
          'system',
        );
        expect(mockRepository.createChecklist).toHaveBeenCalledWith(
          reviewHistoryId,
          'データ保護項目1',
          'system',
        );
      });

      it('複数トピックに対してチェックリストが作成されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockTopicExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            topics: [
              { topic: 'トピック1', reason: '理由1' },
              { topic: 'トピック2', reason: '理由2' },
              { topic: 'トピック3', reason: '理由3' },
            ],
          },
        });

        mockTopicChecklistAgent.generateLegacy.mockResolvedValue({
          object: {
            checklistItems: [
              {
                checklistItem: 'チェック項目',
                reason: '理由',
              },
            ],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'general',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 各トピックに対してチェックリスト作成が実行される
        expect(mockTopicChecklistAgent.generateLegacy).toHaveBeenCalledTimes(3);
        expect(mockRepository.createChecklist).toHaveBeenCalledTimes(3);
      });

      it('checklistRequirementsがruntimeContextに正しく設定されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];
        const checklistRequirements = 'テスト要件';

        mockTopicExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            topics: [{ topic: 'トピック1', reason: '理由1' }],
          },
        });

        mockTopicChecklistAgent.generateLegacy.mockResolvedValue({
          object: {
            checklistItems: [
              {
                checklistItem: 'チェック項目',
                reason: '理由',
              },
            ],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'general',
            checklistRequirements,
          },
        });

        // Assert
        // topicExtractionAgentに渡されたruntimeContextを確認
        const topicExtractionCallArgs =
          mockTopicExtractionAgent.generateLegacy.mock.calls[0];
        const topicExtractionOptions = topicExtractionCallArgs[1];
        const topicRuntimeContext = topicExtractionOptions.runtimeContext;
        expect(topicRuntimeContext.get('checklistRequirements')).toBe(
          checklistRequirements,
        );

        // topicChecklistAgentに渡されたruntimeContextを確認
        const topicChecklistCallArgs =
          mockTopicChecklistAgent.generateLegacy.mock.calls[0];
        const topicChecklistOptions = topicChecklistCallArgs[1];
        const checklistRuntimeContext = topicChecklistOptions.runtimeContext;
        expect(checklistRuntimeContext.get('checklistRequirements')).toBe(
          checklistRequirements,
        );
      });

      it('一部のトピックでチェックリスト作成失敗時も継続すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockTopicExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            topics: [
              { topic: 'トピック1', reason: '理由1' },
              { topic: 'トピック2', reason: '理由2' },
              { topic: 'トピック3', reason: '理由3' },
            ],
          },
        });

        // 2つ目のトピックではチェックリスト項目が生成されない
        mockTopicChecklistAgent.generateLegacy
          .mockResolvedValueOnce({
            object: {
              checklistItems: [
                {
                  checklistItem: 'チェック項目1',
                  reason: '理由1',
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            object: {
              checklistItems: [],
            },
          })
          .mockResolvedValueOnce({
            object: {
              checklistItems: [
                {
                  checklistItem: 'チェック項目3',
                  reason: '理由3',
                },
              ],
            },
          });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'general',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockTopicChecklistAgent.generateLegacy).toHaveBeenCalledTimes(3);
        // チェックリスト項目が生成されたトピックのみDB保存される
        expect(mockRepository.createChecklist).toHaveBeenCalledTimes(2);
      });
    });

    describe('異常系', () => {
      it('トピック抽出失敗時にbailでworkflowが終了すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockTopicExtractionAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'テストエラー' },
          }),
        );

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'general',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toBe('テストエラー');
        expect(mockTopicChecklistAgent.generateLegacy).not.toHaveBeenCalled();
        expect(mockRepository.createChecklist).not.toHaveBeenCalled();
      });

      it('トピックが抽出されない場合の処理', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockTopicExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            topics: [],
          },
        });

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'general',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // トピックがないのでチェックリスト作成は実行されない
        expect(mockTopicChecklistAgent.generateLegacy).not.toHaveBeenCalled();
        expect(mockRepository.createChecklist).not.toHaveBeenCalled();
      });

      it('チェックリスト作成中のAI APIエラー時にbailで終了すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'general.pdf',
            path: '/test/general.pdf',
            type: 'application/pdf',
            processMode: 'text',
          },
        ];

        mockTopicExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            topics: [{ topic: 'トピック1', reason: '理由1' }],
          },
        });

        mockTopicChecklistAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'テストエラー' },
          }),
        );

        // Act
        const run = await checklistExtractionWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentType: 'general',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toBe('テストエラー');
        expect(mockRepository.createChecklist).not.toHaveBeenCalled();
      });
    });
  });

  describe('共通処理', () => {
    it('既存のシステム作成チェックリストが削除されること', async () => {
      // Arrange
      const reviewHistoryId = 'review-1';
      const files: UploadFile[] = [
        {
          id: 'file-1',
          name: 'checklist.pdf',
          path: '/test/checklist.pdf',
          type: 'application/pdf',
          processMode: 'text',
        },
      ];

      mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
        object: {
          isChecklistDocument: true,
          newChecklists: ['チェック項目1'],
        },
      });

      // Act
      const run = await checklistExtractionWorkflow.createRunAsync();
      await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentType: 'checklist-ai',
        },
      });

      // Assert
      expect(mockRepository.deleteSystemCreatedChecklists).toHaveBeenCalledWith(
        reviewHistoryId,
      );
      // deleteSystemCreatedChecklistsがcreateChecklistより前に呼ばれることを確認
      const deleteCallOrder =
        mockRepository.deleteSystemCreatedChecklists.mock.invocationCallOrder[0];
      const createCallOrder =
        mockRepository.createChecklist.mock.invocationCallOrder[0];
      expect(deleteCallOrder).toBeLessThan(createCallOrder);
    });

    it('ワークフロー実行時にmastra.getAgentが正しく呼ばれること', async () => {
      // Arrange
      const reviewHistoryId = 'review-1';
      const files: UploadFile[] = [
        {
          id: 'file-1',
          name: 'checklist.pdf',
          path: '/test/checklist.pdf',
          type: 'application/pdf',
          processMode: 'text',
        },
      ];

      mockChecklistExtractionAgent.generateLegacy.mockResolvedValue({
        object: {
          isChecklistDocument: true,
          newChecklists: ['チェック項目1'],
        },
      });

      const getAgentSpy = jest.spyOn(mastra, 'getAgent');

      // Act
      const run = await checklistExtractionWorkflow.createRunAsync();
      await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentType: 'checklist-ai',
        },
      });

      // Assert
      expect(getAgentSpy).toHaveBeenCalledWith('checklistExtractionAgent');
      expect(mockChecklistExtractionAgent.generateLegacy).toHaveBeenCalled();
    });
  });
});
