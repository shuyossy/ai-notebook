/**
 * チェックリスト抽出ワークフローのテスト
 * @jest-environment node
 */

// Electron モックを最初に適用（他のインポートより前に実行する必要がある）
jest.mock('electron', () => require('../test-utils/mockElectron').mockElectron);
jest.mock(
  'electron-store',
  () => require('../test-utils/mockElectron').default,
);

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
import { checkWorkflowResult } from '@/mastra/lib/workflowUtils';
import type { IReviewRepository } from '@/main/service/port/repository';
import type { UploadFile } from '@/types';
import { IpcChannels } from '@/types';
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
// FileTextExtractor のモック
const mockExtract = jest.fn();

jest.mock('@/main/lib/textExtractor/FileTextExtractor', () => ({
  FileTextExtractor: jest.fn().mockImplementation(() => ({
    extract: (...args: any[]) => mockExtract(...args),
  })),
}));
// イベント発火のモック
const mockPublishEvent = jest.fn();
jest.mock('@/main/lib/eventPayloadHelper', () => ({
  publishEvent: (...args: any[]) => mockPublishEvent(...args),
}));

describe('checklistExtractionWorkflow', () => {
  // モックリポジトリ
  let mockRepository: jest.Mocked<IReviewRepository>;

  // モックエージェント
  let mockChecklistExtractionAgent: any;
  let mockTopicExtractionAgent: any;
  let mockTopicChecklistAgent: any;
  let mockChecklistRefinementAgent: any;

  beforeEach(() => {
    // イベントモックのリセット
    mockPublishEvent.mockClear();

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
      getUncompletedChecklists: jest.fn(),
      updateChecklist: jest.fn(),
      deleteChecklist: jest.fn(),
      upsertReviewResult: jest.fn(),
      getReviewChecklistResults: jest.fn(),
      deleteAllReviewResults: jest.fn(),
      clearReviewResultsByChecklistIds: jest.fn(),
      deleteReviewDocumentCaches: jest.fn(),
      deleteReviewLargedocumentResultCaches: jest.fn(),
      deleteReviewLargedocumentResultCachesByChecklistIds: jest.fn(),
      updateReviewHistoryDocumentMode: jest.fn(),
      createReviewDocumentCache: jest.fn(),
      getReviewDocumentCaches: jest.fn(),
      getReviewDocumentCacheById: jest.fn(),
      getReviewDocumentCacheByIds: jest.fn(),
      createReviewLargedocumentResultCache: jest.fn(),
      getReviewLargedocumentResultCaches: jest.fn(),
      getMaxTotalChunksForDocument: jest.fn(),
      getChecklistResultsWithIndividualResults: jest.fn(),
      getReviewDocumentCacheInfos: jest.fn(),
    } as jest.Mocked<IReviewRepository>;

    (getReviewRepository as jest.Mock).mockReturnValue(mockRepository);

    // getChecklistsのデフォルト値を設定（refinementステップでチェックリストがない場合は早期リターン）
    mockRepository.getChecklists.mockResolvedValue([]);

    // FileTextExtractorのモック
    mockExtract.mockResolvedValue({
      content: 'テストファイルの内容',
      images: [],
      strategyUsed: 'txt-default',
      formatType: 'txt-plain',
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
    mockChecklistRefinementAgent = {
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
      if (agentName === 'checklistRefinementAgent') {
        return mockChecklistRefinementAgent;
      }
      throw new Error(`Unknown agent: ${agentName}`);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockExtract.mockReset();
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
            newChecklists: ['チェック項目1', 'チェック項目2', 'チェック項目3'],
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
        expect(
          mockRepository.deleteSystemCreatedChecklists,
        ).toHaveBeenCalledWith(reviewHistoryId);
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

        // ファイル処理進捗イベントが発行されたことを検証
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'processing',
            currentFileIndex: 0,
            totalFiles: 1,
            currentFileName: 'checklist.pdf',
          }),
        );

        // ファイル処理完了イベントが発行されたことを検証
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'completed',
            currentFileIndex: 1,
            totalFiles: 1,
          }),
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
        expect(mockExtract).toHaveBeenCalledTimes(2);
        expect(
          mockChecklistExtractionAgent.generateLegacy,
        ).toHaveBeenCalledTimes(1);

        // generateLegacyに渡されたメッセージを確認
        const callArgs =
          mockChecklistExtractionAgent.generateLegacy.mock.calls[0];
        const message = callArgs[0];
        expect(message.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('checklist1.pdf, checklist2.pdf'),
            }),
          ]),
        );

        // 各ファイルに対してファイル処理進捗イベントが発行されたことを検証
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'processing',
            currentFileIndex: 0,
            totalFiles: 2,
            currentFileName: 'checklist1.pdf',
          }),
        );
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'processing',
            currentFileIndex: 1,
            totalFiles: 2,
            currentFileName: 'checklist2.pdf',
          }),
        );

        // ファイル処理完了イベントが発行されたことを検証
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'completed',
            currentFileIndex: 2,
            totalFiles: 2,
          }),
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

        // mockExtractが呼ばれないことを確認
        expect(mockExtract).not.toHaveBeenCalled();

        // generateLegacyに画像データが含まれることを確認
        const callArgs =
          mockChecklistExtractionAgent.generateLegacy.mock.calls[0];
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
        const callArgs =
          mockChecklistExtractionAgent.generateLegacy.mock.calls[0];
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
        const checklistRequirements =
          'セキュリティに関する項目を作成してください';

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

        // checklistRefinementStepのモック設定（ブラッシュアップ後のチェックリスト）
        mockChecklistRefinementAgent.generateLegacy.mockResolvedValue({
          object: {
            refinedChecklists: [
              'セキュリティ項目1',
              'セキュリティ項目2',
              'データ保護項目1',
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
        expect(
          mockRepository.deleteSystemCreatedChecklists,
        ).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockTopicExtractionAgent.generateLegacy).toHaveBeenCalledTimes(
          1,
        );
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

        // ファイル処理進捗イベントが発行されたことを検証（トピック抽出ステップ）
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'processing',
            currentFileIndex: 0,
            totalFiles: 1,
            currentFileName: 'general.pdf',
          }),
        );

        // ファイル処理完了イベントが発行されたことを検証
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'completed',
            currentFileIndex: 1,
            totalFiles: 1,
          }),
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

        // checklistRefinementStepのモック設定（ブラッシュアップ後のチェックリスト）
        mockChecklistRefinementAgent.generateLegacy.mockResolvedValue({
          object: {
            refinedChecklists: [
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
            documentType: 'general',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 各トピックに対してチェックリスト作成が実行される
        expect(mockTopicChecklistAgent.generateLegacy).toHaveBeenCalledTimes(3);
        // ブラッシュアップ後のチェックリストがDBに保存される
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

        // checklistRefinementStepのモック設定（ブラッシュアップ後のチェックリスト）
        // 2件のチェックリストが生成された（2つ目のトピックは空）
        mockChecklistRefinementAgent.generateLegacy.mockResolvedValue({
          object: {
            refinedChecklists: ['チェック項目1', 'チェック項目3'],
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
        mockRepository.deleteSystemCreatedChecklists.mock
          .invocationCallOrder[0];
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

  describe('チェックリストブラッシュアップステップ', () => {
    describe('正常系', () => {
      it('一般ドキュメントワークフローでチェックリストがブラッシュアップされること', async () => {
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

        mockTopicChecklistAgent.generateLegacy.mockResolvedValue({
          object: {
            checklistItems: [
              { checklistItem: '重複項目A', reason: '理由A' },
              { checklistItem: '重複項目A', reason: '理由B' },
              { checklistItem: '項目B', reason: '理由C' },
            ],
          },
        });

        // ブラッシュアップの結果（重複削除後）
        // checklistRefinementStepは前ステップの結果（inputData.systemChecklists）からチェックリストを取得する
        mockChecklistRefinementAgent.generateLegacy.mockResolvedValue({
          object: {
            refinedChecklists: ['統合項目A', '項目B'],
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

        // checklistRefinementAgentが呼ばれることを確認
        expect(
          mockChecklistRefinementAgent.generateLegacy,
        ).toHaveBeenCalledTimes(1);

        // トピック抽出ステップで既存チェックリストが削除されること
        expect(
          mockRepository.deleteSystemCreatedChecklists,
        ).toHaveBeenCalledWith(reviewHistoryId);
        expect(
          mockRepository.deleteSystemCreatedChecklists,
        ).toHaveBeenCalledTimes(1);
      });

      it('トピックからチェックリストが生成されない場合はブラッシュアップをスキップすること', async () => {
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

        // トピックからチェックリストが生成されない（空のchecklistItems）
        mockTopicChecklistAgent.generateLegacy.mockResolvedValue({
          object: {
            checklistItems: [],
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

        // チェックリストがないのでブラッシュアップエージェントは呼ばれない
        expect(
          mockChecklistRefinementAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        // チェックリストがないのでDB保存も呼ばれない
        expect(mockRepository.createChecklist).not.toHaveBeenCalled();
      });

      it('ブラッシュアップでruntimeContextにchecklistRequirementsが正しく設定されること', async () => {
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
        const checklistRequirements = 'ブラッシュアップ時の要件';

        mockTopicExtractionAgent.generateLegacy.mockResolvedValue({
          object: {
            topics: [{ topic: 'トピック1', reason: '理由1' }],
          },
        });

        mockTopicChecklistAgent.generateLegacy.mockResolvedValue({
          object: {
            checklistItems: [{ checklistItem: '元項目1', reason: '理由1' }],
          },
        });

        mockRepository.getChecklists.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            content: '元項目1',
            createdBy: 'system',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockChecklistRefinementAgent.generateLegacy.mockResolvedValue({
          object: {
            refinedChecklists: ['ブラッシュアップ後項目1'],
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
        const callArgs =
          mockChecklistRefinementAgent.generateLegacy.mock.calls[0];
        const options = callArgs[1];
        const runtimeContext = options.runtimeContext;

        // checklistRequirementsが設定されていること
        expect(runtimeContext.get('checklistRequirements')).toBe(
          checklistRequirements,
        );

        // userプロンプトにチェックリスト項目が含まれていること
        const prompt = callArgs[0];
        expect(prompt).toContain('元項目1');
        expect(prompt).toContain('ORIGINAL CHECKLIST ITEMS TO REFINE');
      });
    });

    describe('異常系', () => {
      it('ブラッシュアップ中のAI APIエラー時にbailで終了すること', async () => {
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

        mockTopicChecklistAgent.generateLegacy.mockResolvedValue({
          object: {
            checklistItems: [{ checklistItem: '項目1', reason: '理由1' }],
          },
        });

        mockRepository.getChecklists.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            content: '項目1',
            createdBy: 'system',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockChecklistRefinementAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'ブラッシュアップエラー' },
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
        expect(checkResult.errorMessage).toBe('ブラッシュアップエラー');
      });
    });
  });
});
