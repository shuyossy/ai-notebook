/**
 * チャット質問ワークフローのテスト
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

import { reviewChatWorkflow } from '@/mastra/workflows/reviewChat';
import { mastra } from '@/mastra';
import { getReviewRepository } from '@/adapter/db';
import { checkWorkflowResult } from '@/mastra/lib/workflowUtils';
import type { IReviewRepository } from '@/main/service/port/repository/IReviewRepository';
import { internalError } from '@/main/lib/error';
import { DataStreamWriter } from 'ai';
import { APICallError } from 'ai';

const { RuntimeContext } = require('@mastra/core/runtime-context');

// モック設定
jest.mock('@/adapter/db', () => ({
  getReviewRepository: jest.fn(),
  getSourceRepository: jest.fn(() => ({
    getAllSources: jest.fn(),
    getSourceById: jest.fn(),
    createSource: jest.fn(),
    updateSource: jest.fn(),
    deleteSource: jest.fn(),
    updateSourceEnabled: jest.fn(),
  })),
  getChatRepository: jest.fn(() => ({
    getChatRooms: jest.fn(),
    getChatMessages: jest.fn(),
  })),
  getSettingsRepository: jest.fn(() => ({
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

jest.mock('@/main/lib/eventPayloadHelper', () => ({
  publishEvent: jest.fn(),
}));

// DataStreamWriterのモック
const createMockDataStreamWriter = (): jest.Mocked<DataStreamWriter> => ({
  write: jest.fn(),
} as any);

describe('reviewChatWorkflow', () => {
  // モックリポジトリ
  let mockRepository: jest.Mocked<IReviewRepository>;

  // モックエージェント
  let mockReviewChatPlanningAgent: any;
  let mockReviewChatResearchAgent: any;
  let mockReviewChatAnswerAgent: any;

  // モックDataStreamWriter
  let mockDataStreamWriter: jest.Mocked<DataStreamWriter>;

  beforeEach(() => {
    // リポジトリのモック
    mockRepository = {
      createReviewHistory: jest.fn(),
      getReviewHistory: jest.fn(),
      getAllReviewHistories: jest.fn(),
      updateReviewHistoryTitle: jest.fn(),
      updateReviewHistoryAdditionalInstructionsAndCommentFormat: jest.fn(),
      updateReviewHistoryEvaluationSettings: jest.fn(),
      updateReviewHistoryProcessingStatus: jest.fn(),
      updateReviewHistoryTargetDocumentName: jest.fn(),
      deleteReviewHistory: jest.fn(),
      getChecklists: jest.fn(),
      createChecklist: jest.fn(),
      updateChecklist: jest.fn(),
      deleteChecklist: jest.fn(),
      deleteSystemCreatedChecklists: jest.fn(),
      upsertReviewResult: jest.fn(),
      getReviewChecklistResults: jest.fn(),
      deleteAllReviewResults: jest.fn(),
      deleteReviewDocumentCaches: jest.fn(),
      deleteReviewLargedocumentResultCaches: jest.fn(),
      updateReviewHistoryDocumentMode: jest.fn(),
      createReviewDocumentCache: jest.fn(),
      getReviewDocumentCaches: jest.fn().mockResolvedValue([
        {
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'document1.txt',
          processMode: 'text',
          textContent: 'ドキュメント1の内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]),
      getReviewDocumentCacheById: jest.fn().mockResolvedValue({
        id: 1,
        reviewHistoryId: 'review-1',
        fileName: 'document1.txt',
        processMode: 'text',
        textContent: 'ドキュメント1の内容',
        imageData: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }),
      getReviewDocumentCacheByIds: jest.fn().mockResolvedValue([
        {
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'document1.txt',
          processMode: 'text',
          textContent: 'ドキュメント1の内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]),
      createReviewLargedocumentResultCache: jest.fn(),
      getReviewLargedocumentResultCaches: jest.fn(),
      getMaxTotalChunksForDocument: jest.fn().mockResolvedValue(1),
      getChecklistResultsWithIndividualResults: jest.fn().mockResolvedValue([
        {
          checklistResult: {
            id: 1,
            content: 'チェック項目1',
            sourceEvaluation: {
              evaluation: 'A',
              comment: '良好です',
            },
          },
          individualResults: undefined,
        },
      ]),
    } as jest.Mocked<IReviewRepository>;

    (getReviewRepository as jest.Mock).mockReturnValue(mockRepository);

    // Mastraエージェントのモック
    mockReviewChatPlanningAgent = {
      generateLegacy: jest.fn(),
    };
    mockReviewChatResearchAgent = {
      generateLegacy: jest.fn(),
    };
    mockReviewChatAnswerAgent = {
      generateLegacy: jest.fn(),
    };

    // mastra.getAgentのモック
    jest.spyOn(mastra, 'getAgent').mockImplementation((agentName: string) => {
      if (agentName === 'reviewChatPlanningAgent') {
        return mockReviewChatPlanningAgent;
      }
      if (agentName === 'reviewChatResearchAgent') {
        return mockReviewChatResearchAgent;
      }
      if (agentName === 'reviewChatAnswerAgent') {
        return mockReviewChatAnswerAgent;
      }
      throw new Error(`Unknown agent: ${agentName}`);
    });

    // DataStreamWriterのモック
    mockDataStreamWriter = createMockDataStreamWriter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    describe('基本機能', () => {
      it('基本的な質問処理が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = 'ドキュメントの内容を教えてください';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査する必要がある',
                documentId: '1',
                researchContent: 'ドキュメントの主要な内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: 'ドキュメント1には重要な情報が含まれています',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: 'ドキュメントには重要な情報が含まれており、問題ありません。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect((result as any).result?.answer).toBe(
          'ドキュメントには重要な情報が含まれており、問題ありません。',
        );

        // AI呼び出しの確認
        expect(mockReviewChatPlanningAgent.generateLegacy).toHaveBeenCalledTimes(
          1,
        );
        expect(mockReviewChatResearchAgent.generateLegacy).toHaveBeenCalledTimes(
          1,
        );
        expect(mockReviewChatAnswerAgent.generateLegacy).toHaveBeenCalledTimes(
          1,
        );

        // DB操作の確認
        expect(
          mockRepository.getChecklistResultsWithIndividualResults,
        ).toHaveBeenCalledWith(reviewHistoryId, checklistIds);
        expect(mockRepository.getReviewDocumentCaches).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(mockRepository.getMaxTotalChunksForDocument).toHaveBeenCalledWith(
          1,
        );

        // DataStreamWriterの呼び出し確認
        expect(mockDataStreamWriter.write).toHaveBeenCalled();
      });

      it('複数ドキュメント調査が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '複数のドキュメントの内容を教えてください';

        mockRepository.getReviewDocumentCaches.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockRepository.getReviewDocumentCacheById
          .mockResolvedValueOnce({
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          })
          .mockResolvedValueOnce({
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          });

        mockRepository.getReviewDocumentCacheByIds.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
              {
                reasoning: 'ドキュメント2を調査',
                documentId: '2',
                researchContent: 'ドキュメント2の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '両方のドキュメントに重要な情報が含まれています。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 2つのドキュメントが並列で調査されることを確認
        expect(mockReviewChatResearchAgent.generateLegacy).toHaveBeenCalledTimes(
          2,
        );
      });
    });

    describe('画像処理', () => {
      it('画像モード（ページ別）での調査が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '画像ドキュメントの内容を教えてください';

        mockRepository.getReviewDocumentCaches.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: [
              'data:image/png;base64,page1',
              'data:image/png;base64,page2',
            ],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockRepository.getReviewDocumentCacheById.mockResolvedValue({
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'document.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: [
            'data:image/png;base64,page1',
            'data:image/png;base64,page2',
          ],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockRepository.getReviewDocumentCacheByIds.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: [
              'data:image/png;base64,page1',
              'data:image/png;base64,page2',
            ],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: '画像ドキュメントを調査',
                documentId: '1',
                researchContent: '画像の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '画像には重要な図表が含まれています',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '画像ドキュメントには重要な図表が含まれています。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // researchChunkStepに画像データが渡されることを確認
        const callArgs =
          mockReviewChatResearchAgent.generateLegacy.mock.calls[0];
        const message = callArgs[0];
        expect(message.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'image',
              image: 'data:image/png;base64,page1',
            }),
            expect.objectContaining({
              type: 'image',
              image: 'data:image/png;base64,page2',
            }),
          ]),
        );
      });

      it('画像モード（統合）での調査が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '統合画像ドキュメントの内容を教えてください';

        mockRepository.getReviewDocumentCaches.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: ['data:image/png;base64,merged'],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockRepository.getReviewDocumentCacheById.mockResolvedValue({
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'document.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: ['data:image/png;base64,merged'],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockRepository.getReviewDocumentCacheByIds.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: ['data:image/png;base64,merged'],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: '統合画像を調査',
                documentId: '1',
                researchContent: '統合画像の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '統合画像には全体的な構成が含まれています',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '統合画像には全体的な構成が含まれています。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 統合画像データが渡されることを確認
        const callArgs =
          mockReviewChatResearchAgent.generateLegacy.mock.calls[0];
        const message = callArgs[0];
        expect(message.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'image',
              image: 'data:image/png;base64,merged',
            }),
          ]),
        );
      });
    });

    describe('チャンク分割', () => {
      it('コンテキスト長エラー後のチャンク分割が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '長いドキュメントの内容を教えてください';

        mockRepository.getReviewDocumentCacheById.mockResolvedValue({
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'long-document.txt',
          processMode: 'text',
          textContent: 'A'.repeat(10000),
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: '長いドキュメントを調査',
                documentId: '1',
                researchContent: '長いドキュメントの内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        // 1回目: コンテキスト長エラー
        // 2回目以降: チャンク分割後に成功
        let callCount = 0;
        mockReviewChatResearchAgent.generateLegacy.mockImplementation(
          async () => {
            callCount++;
            if (callCount === 1) {
              // コンテキスト長エラーをthrow
              throw new APICallError({
                message: 'Context length exceeded',
                url: 'http://test-api',
                requestBodyValues: {},
                statusCode: 400,
                responseBody: JSON.stringify({
                  error: 'maximum context length exceeded',
                }),
                cause: new Error('maximum context length exceeded'),
                isRetryable: false,
              });
            }
            return {
              text: '分割後の調査結果',
              finishReason: 'stop',
            };
          },
        );

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '長いドキュメントの内容を分割して調査しました。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 1回失敗 + 2チャンクで成功 = 3回呼ばれる
        expect(mockReviewChatResearchAgent.generateLegacy).toHaveBeenCalledTimes(
          3,
        );
      });

      it('複数回のチャンク分割リトライが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '非常に長いドキュメントの内容を教えてください';

        mockRepository.getReviewDocumentCacheById.mockResolvedValue({
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'very-long-document.txt',
          processMode: 'text',
          textContent: 'A'.repeat(20000),
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: '非常に長いドキュメントを調査',
                documentId: '1',
                researchContent: '非常に長いドキュメントの内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        // 1回目と2回目: コンテキスト長エラー
        // 3回目以降: チャンク分割後に成功
        let callCount = 0;
        mockReviewChatResearchAgent.generateLegacy.mockImplementation(
          async () => {
            callCount++;
            if (callCount <= 2) {
              // コンテキスト長エラーをthrow
              throw new APICallError({
                message: 'Context length exceeded',
                url: 'http://test-api',
                requestBodyValues: {},
                statusCode: 400,
                responseBody: JSON.stringify({
                  error: 'maximum context length exceeded',
                }),
                cause: new Error('maximum context length exceeded'),
                isRetryable: false,
              });
            }
            return {
              text: '分割後の調査結果',
              finishReason: 'stop',
            };
          },
        );

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '非常に長いドキュメントの内容を分割して調査しました。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 複数回のリトライが発生していることを確認
        // 1回目: totalChunks=1で失敗、2回目: totalChunks=2で失敗、3回目: totalChunks=4で4チャンク並列実行して成功
        expect(
          mockReviewChatResearchAgent.generateLegacy,
        ).toHaveBeenCalledTimes(6); // 1 + 1 + 4 = 6回
      });
    });

    describe('レビューモード', () => {
      it('レビューモード（large）での調査が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '個別レビュー結果について教えてください';

        // individualResultsありのケース
        mockRepository.getChecklistResultsWithIndividualResults.mockResolvedValue(
          [
            {
              checklistResult: {
                id: 1,
                content: 'チェック項目1',
                sourceEvaluation: {
                  evaluation: 'A',
                  comment: '良好です',
                },
              },
              individualResults: [
                {
                  documentId: 1,
                  comment: 'ドキュメント1は良好',
                  individualFileName: 'document1.txt',
                },
                {
                  documentId: 2,
                  comment: 'ドキュメント2も良好',
                  individualFileName: 'document2.txt',
                },
              ],
            },
          ],
        );

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の個別レビュー結果を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '個別レビュー結果の調査完了',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '個別レビュー結果は良好です。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // planResearchStepのruntimeContextにreviewMode='large'が設定されることを確認
        const planCallArgs =
          mockReviewChatPlanningAgent.generateLegacy.mock.calls[0];
        const planOptions = planCallArgs[1];
        expect(planOptions.runtimeContext.get('reviewMode')).toBe('large');
      });

      it('レビューモード（small）での調査が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = 'レビュー結果について教えてください';

        // individualResultsなしのケース
        mockRepository.getChecklistResultsWithIndividualResults.mockResolvedValue(
          [
            {
              checklistResult: {
                id: 1,
                content: 'チェック項目1',
                sourceEvaluation: {
                  evaluation: 'A',
                  comment: '良好です',
                },
              },
              individualResults: undefined,
            },
          ],
        );

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1のレビュー結果を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: 'レビュー結果の調査完了',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: 'レビュー結果は良好です。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // planResearchStepのruntimeContextにreviewMode='small'が設定されることを確認
        const planCallArgs =
          mockReviewChatPlanningAgent.generateLegacy.mock.calls[0];
        const planOptions = planCallArgs[1];
        expect(planOptions.runtimeContext.get('reviewMode')).toBe('small');
      });

      it('大量ドキュメントレビュー時にindividualResultsがplanResearchStepのchecklistInfoに正しく反映されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '個別レビュー結果の詳細を教えてください';

        // individualResultsが複数あるケース
        mockRepository.getChecklistResultsWithIndividualResults.mockResolvedValue(
          [
            {
              checklistResult: {
                id: 1,
                content: 'セキュリティ要件を満たしているか',
                sourceEvaluation: {
                  evaluation: 'B',
                  comment: '一部改善が必要',
                },
              },
              individualResults: [
                {
                  documentId: 1,
                  comment: 'ドキュメント1では認証機能が不足',
                  individualFileName: 'security-spec.pdf',
                },
                {
                  documentId: 2,
                  comment: 'ドキュメント2では暗号化が適切',
                  individualFileName: 'encryption-design.pdf',
                },
                {
                  documentId: 3,
                  comment: 'ドキュメント3ではアクセス制御に問題あり',
                  individualFileName: 'access-control.pdf',
                },
              ],
            },
          ],
        );

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'セキュリティ仕様書を調査',
                documentId: '1',
                researchContent: '認証機能の不足について詳細調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '認証機能の詳細調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '個別レビュー結果の分析完了。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // planResearchStepの呼び出しを確認
        const planCallArgs =
          mockReviewChatPlanningAgent.generateLegacy.mock.calls[0];
        const planOptions = planCallArgs[1];

        // reviewMode='large'が設定されていることを確認
        expect(planOptions.runtimeContext.get('reviewMode')).toBe('large');

        // checklistInfoにindividualResultsの情報が含まれることを確認
        const checklistInfo = planOptions.runtimeContext.get('checklistInfo');
        expect(checklistInfo).toBeTruthy();
        expect(checklistInfo).toContain('Individual Review Results:');
        expect(checklistInfo).toContain('Document ID: 1');
        expect(checklistInfo).toContain('Document Name: security-spec.pdf');
        expect(checklistInfo).toContain('Comment: ドキュメント1では認証機能が不足');
        expect(checklistInfo).toContain('Document ID: 2');
        expect(checklistInfo).toContain('Document Name: encryption-design.pdf');
        expect(checklistInfo).toContain('Comment: ドキュメント2では暗号化が適切');
        expect(checklistInfo).toContain('Document ID: 3');
        expect(checklistInfo).toContain(
          'Document Name: access-control.pdf',
        );
        expect(checklistInfo).toContain(
          'Comment: ドキュメント3ではアクセス制御に問題あり',
        );
      });

      it('researchChunkStep実行時にindividualResultsが調査コンテキストに含まれること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = 'ドキュメントの個別レビュー状況を確認したい';

        // individualResultsを含むチェックリスト結果
        mockRepository.getChecklistResultsWithIndividualResults.mockResolvedValue(
          [
            {
              checklistResult: {
                id: 1,
                content: 'データベース設計は適切か',
                sourceEvaluation: {
                  evaluation: 'C',
                  comment: '設計に課題あり',
                },
              },
              individualResults: [
                {
                  documentId: 1,
                  comment: 'テーブル正規化が不十分',
                  individualFileName: 'db-design.pdf',
                },
                {
                  documentId: 2,
                  comment: 'インデックス設計は良好',
                  individualFileName: 'index-design.pdf',
                },
              ],
            },
          ],
        );

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'データベース設計書を調査',
                documentId: '1',
                researchContent: 'テーブル正規化の問題を詳細調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: 'テーブル正規化の詳細調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: 'データベース設計の分析完了。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // researchChunkStepの呼び出しを確認
        const researchCallArgs =
          mockReviewChatResearchAgent.generateLegacy.mock.calls[0];
        const researchOptions = researchCallArgs[1];

        // reviewMode='large'が設定されていることを確認
        expect(researchOptions.runtimeContext.get('reviewMode')).toBe('large');

        // checklistInfoにindividualResultsの情報が含まれることを確認
        const checklistInfo =
          researchOptions.runtimeContext.get('checklistInfo');
        expect(checklistInfo).toBeTruthy();
        expect(checklistInfo).toContain('Individual Review Results:');
        expect(checklistInfo).toContain('Document ID: 1');
        expect(checklistInfo).toContain('Document Name: db-design.pdf');
        expect(checklistInfo).toContain('Comment: テーブル正規化が不十分');
        expect(checklistInfo).toContain('Document ID: 2');
        expect(checklistInfo).toContain('Document Name: index-design.pdf');
        expect(checklistInfo).toContain('Comment: インデックス設計は良好');
      });

      it('複数チェックリスト項目にそれぞれindividualResultsがある場合に正しく処理されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1, 2, 3];
        const question = '全チェック項目の個別レビュー結果を確認';

        // 複数のチェックリスト項目、各項目に複数のindividualResults
        mockRepository.getChecklistResultsWithIndividualResults.mockResolvedValue(
          [
            {
              checklistResult: {
                id: 1,
                content: 'API設計は適切か',
                sourceEvaluation: {
                  evaluation: 'A',
                  comment: '優れた設計',
                },
              },
              individualResults: [
                {
                  documentId: 1,
                  comment: 'RESTful設計が適切',
                  individualFileName: 'api-spec.pdf',
                },
                {
                  documentId: 2,
                  comment: 'エラーハンドリングが明確',
                  individualFileName: 'error-handling.pdf',
                },
              ],
            },
            {
              checklistResult: {
                id: 2,
                content: 'パフォーマンス要件を満たすか',
                sourceEvaluation: {
                  evaluation: 'B',
                  comment: '改善の余地あり',
                },
              },
              individualResults: [
                {
                  documentId: 1,
                  comment: 'キャッシュ戦略が不十分',
                  individualFileName: 'performance-spec.pdf',
                },
                {
                  documentId: 3,
                  comment: '負荷分散設計は良好',
                  individualFileName: 'load-balancing.pdf',
                },
              ],
            },
            {
              checklistResult: {
                id: 3,
                content: 'テスト計画は十分か',
                sourceEvaluation: {
                  evaluation: 'C',
                  comment: 'テストケースが不足',
                },
              },
              individualResults: [
                {
                  documentId: 2,
                  comment: '単体テストは十分',
                  individualFileName: 'unit-test-plan.pdf',
                },
                {
                  documentId: 4,
                  comment: '統合テストが不足',
                  individualFileName: 'integration-test-plan.pdf',
                },
              ],
            },
          ],
        );

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'API仕様書を調査',
                documentId: '1',
                researchContent: 'API設計の詳細調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: 'API設計の調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '全チェック項目の個別レビュー結果を分析しました。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // planResearchStepの呼び出しを確認
        const planCallArgs =
          mockReviewChatPlanningAgent.generateLegacy.mock.calls[0];
        const planOptions = planCallArgs[1];

        // reviewMode='large'が設定されていることを確認
        expect(planOptions.runtimeContext.get('reviewMode')).toBe('large');

        // checklistInfoに全チェックリスト項目のindividualResultsが含まれることを確認
        const checklistInfo = planOptions.runtimeContext.get('checklistInfo');
        expect(checklistInfo).toBeTruthy();

        // チェックリスト1の情報確認
        expect(checklistInfo).toContain('Checklist ID: 1');
        expect(checklistInfo).toContain('Content: API設計は適切か');
        expect(checklistInfo).toContain('Comment: RESTful設計が適切');
        expect(checklistInfo).toContain(
          'Comment: エラーハンドリングが明確',
        );

        // チェックリスト2の情報確認
        expect(checklistInfo).toContain('Checklist ID: 2');
        expect(checklistInfo).toContain(
          'Content: パフォーマンス要件を満たすか',
        );
        expect(checklistInfo).toContain('Comment: キャッシュ戦略が不十分');
        expect(checklistInfo).toContain('Comment: 負荷分散設計は良好');

        // チェックリスト3の情報確認
        expect(checklistInfo).toContain('Checklist ID: 3');
        expect(checklistInfo).toContain('Content: テスト計画は十分か');
        expect(checklistInfo).toContain('Comment: 単体テストは十分');
        expect(checklistInfo).toContain('Comment: 統合テストが不足');

        // 各ドキュメント名の確認
        expect(checklistInfo).toContain('Document Name: api-spec.pdf');
        expect(checklistInfo).toContain(
          'Document Name: error-handling.pdf',
        );
        expect(checklistInfo).toContain(
          'Document Name: performance-spec.pdf',
        );
        expect(checklistInfo).toContain(
          'Document Name: load-balancing.pdf',
        );
        expect(checklistInfo).toContain(
          'Document Name: unit-test-plan.pdf',
        );
        expect(checklistInfo).toContain(
          'Document Name: integration-test-plan.pdf',
        );
      });
    });

    describe('RuntimeContext', () => {
      it('RuntimeContextに正しい値が設定されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = 'RuntimeContextの検証';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '回答',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        // planResearchStepのruntimeContextを確認
        const planCallArgs =
          mockReviewChatPlanningAgent.generateLegacy.mock.calls[0];
        const planOptions = planCallArgs[1];
        expect(planOptions.runtimeContext.get('availableDocuments')).toEqual([
          { id: 1, fileName: 'document1.txt' },
        ]);
        expect(planOptions.runtimeContext.get('checklistInfo')).toBeTruthy();
        expect(planOptions.runtimeContext.get('reviewMode')).toBe('small');

        // researchChunkStepのruntimeContextを確認
        const researchCallArgs =
          mockReviewChatResearchAgent.generateLegacy.mock.calls[0];
        const researchOptions = researchCallArgs[1];
        expect(
          researchOptions.runtimeContext.get('researchContent'),
        ).toBeTruthy();
        expect(researchOptions.runtimeContext.get('fileName')).toBe(
          'document1.txt',
        );
        expect(
          researchOptions.runtimeContext.get('checklistInfo'),
        ).toBeTruthy();
        expect(researchOptions.runtimeContext.get('userQuestion')).toBe(
          question,
        );

        // generateAnswerStepのruntimeContextを確認
        const answerCallArgs =
          mockReviewChatAnswerAgent.generateLegacy.mock.calls[0];
        const answerOptions = answerCallArgs[1];
        expect(answerOptions.runtimeContext.get('userQuestion')).toBe(question);
        expect(answerOptions.runtimeContext.get('checklistInfo')).toBeTruthy();
        expect(answerOptions.runtimeContext.get('reviewMode')).toBe('small');
      });
    });

    describe('DataStreamWriter', () => {
      it('調査開始イベントが正しく書き込まれること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '回答',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        // 調査開始イベントの確認
        const researchStartCall = mockDataStreamWriter.write.mock.calls.find(
          (call) => call[0].includes('researchDocumentStart'),
        );
        expect(researchStartCall).toBeTruthy();
        const startEventData = JSON.parse(
          researchStartCall![0].replace('9:', '').trim(),
        );
        expect(startEventData.toolCallId).toBe(
          'reviewChatResearchDocument-test-tool-call-id',
        );
        expect(startEventData.toolName).toBe('researchDocumentStart');
        expect(startEventData.args).toHaveLength(1);
        expect(startEventData.args[0].documentName).toBe('document1.txt');
        expect(startEventData.args[0].researchContent).toBe(
          'ドキュメント1の内容を調査',
        );
      });

      it('調査完了イベントが正しく書き込まれること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果テキスト',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '回答',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        // 調査完了イベントの確認
        const researchCompleteCall =
          mockDataStreamWriter.write.mock.calls.find((call) =>
            call[0].includes('researchDocumentComplete'),
          );
        expect(researchCompleteCall).toBeTruthy();
        const completeEventData = JSON.parse(
          researchCompleteCall![0].replace('a:', '').trim(),
        );
        expect(completeEventData.toolCallId).toBe(
          'reviewChatResearchDocument-test-tool-call-id',
        );
        expect(completeEventData.toolName).toBe('researchDocumentComplete');
        expect(completeEventData.result).toHaveLength(1);
        expect(completeEventData.result[0].documentName).toBe('document1.txt');
        expect(completeEventData.result[0].researchResult).toContain(
          '調査結果テキスト',
        );
      });

      it('ストリーミングチャンクが正しく書き込まれること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        // ストリーミングをシミュレート
        mockReviewChatAnswerAgent.generateLegacy.mockImplementation(
          async (_prompt: any, options: any) => {
            // onStepFinishを呼び出してストリーミングをシミュレート
            if (options?.onStepFinish) {
              options.onStepFinish({
                text: 'チャンク1',
                toolCalls: [],
                toolResults: [],
                finishReason: 'stop',
                usage: { promptTokens: 100, completionTokens: 50 },
              });
            }
            return {
              text: '最終回答',
              finishReason: 'stop',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          },
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        // ストリーミングチャンクの確認
        const textChunkCalls = mockDataStreamWriter.write.mock.calls.filter(
          (call) => call[0].startsWith('0:'),
        );
        expect(textChunkCalls.length).toBeGreaterThan(0);
        const firstChunk = textChunkCalls[0][0];
        expect(firstChunk).toContain('チャンク1');

        // 終了イベントの確認
        const finishCalls = mockDataStreamWriter.write.mock.calls.filter(
          (call) => call[0].startsWith('e:'),
        );
        expect(finishCalls.length).toBeGreaterThan(0);
      });

      it('複数ドキュメント調査時のイベントが正しく書き込まれること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '複数ドキュメントの質問';

        mockRepository.getReviewDocumentCaches.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockRepository.getReviewDocumentCacheById
          .mockResolvedValueOnce({
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          })
          .mockResolvedValueOnce({
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          });

        mockRepository.getReviewDocumentCacheByIds.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
              {
                reasoning: 'ドキュメント2を調査',
                documentId: '2',
                researchContent: 'ドキュメント2の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '回答',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        // 調査開始イベントの確認（2つのドキュメント）
        const researchStartCall = mockDataStreamWriter.write.mock.calls.find(
          (call) => call[0].includes('researchDocumentStart'),
        );
        expect(researchStartCall).toBeTruthy();
        const startEventData = JSON.parse(
          researchStartCall![0].replace('9:', '').trim(),
        );
        expect(startEventData.args).toHaveLength(2);
        expect(startEventData.args[0].documentName).toBe('document1.txt');
        expect(startEventData.args[1].documentName).toBe('document2.txt');

        // 調査完了イベントの確認（2つのドキュメント）
        const researchCompleteCall =
          mockDataStreamWriter.write.mock.calls.find((call) =>
            call[0].includes('researchDocumentComplete'),
          );
        expect(researchCompleteCall).toBeTruthy();
        const completeEventData = JSON.parse(
          researchCompleteCall![0].replace('a:', '').trim(),
        );
        expect(completeEventData.result).toHaveLength(2);
      });
    });
  });

  describe('異常系', () => {
    describe('Step単位のエラー', () => {
      it('調査計画作成失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: '調査計画作成エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('調査計画作成エラー');
        expect(mockReviewChatResearchAgent.generateLegacy).not.toHaveBeenCalled();
        expect(mockReviewChatAnswerAgent.generateLegacy).not.toHaveBeenCalled();
      });

      it('ドキュメント調査失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'ドキュメント調査エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ドキュメント調査エラー');
        expect(mockReviewChatAnswerAgent.generateLegacy).not.toHaveBeenCalled();
      });

      it('回答生成失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: '回答生成エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('回答生成エラー');
      });
    });

    describe('チャンク分割関連', () => {
      it('チャンク分割最大リトライ超過時にエラーになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '非常に長いドキュメントの質問';

        mockRepository.getReviewDocumentCacheById.mockResolvedValue({
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'extremely-long-document.txt',
          processMode: 'text',
          textContent: 'A'.repeat(100000),
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: '非常に長いドキュメントを調査',
                documentId: '1',
                researchContent: '非常に長いドキュメントの内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        // 常にコンテキスト長エラーをthrow（最大5回リトライまで）
        mockReviewChatResearchAgent.generateLegacy.mockImplementation(
          async () => {
            throw new APICallError({
              message: 'Context length exceeded',
              url: 'http://test-api',
              requestBodyValues: {},
              statusCode: 400,
              responseBody: JSON.stringify({
                error: 'maximum context length exceeded',
              }),
              cause: new Error('maximum context length exceeded'),
              isRetryable: false,
            });
          },
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        // 最大リトライ超過時は汎用エラーメッセージになる
        expect(checkResult.errorMessage).toBeTruthy();
      });
    });

    describe('データ取得エラー', () => {
      it('チェックリスト結果取得失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockRepository.getChecklistResultsWithIndividualResults.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'DB接続エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('DB接続エラー');
      });

      it('planResearchStep内のgetReviewDocumentCaches失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockRepository.getReviewDocumentCaches.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'ドキュメントキャッシュ一覧取得エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          'ドキュメントキャッシュ一覧取得エラー',
        );
      });

      it('generateAnswerStep内のgetReviewDocumentCacheByIds失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        // getReviewDocumentCacheByIdsでエラー
        mockRepository.getReviewDocumentCacheByIds.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'ドキュメントキャッシュ複数取得エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          'ドキュメントキャッシュ複数取得エラー',
        );
      });

      it('ドキュメントキャッシュ取得失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockRepository.getReviewDocumentCacheById.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'キャッシュ取得エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        // researchDocumentWithRetryWorkflow内でcatchされて汎用エラーメッセージになる
        expect(checkResult.errorMessage).toBeTruthy();
      });

      it('ドキュメントキャッシュ未発見時にエラーになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockRepository.getReviewDocumentCacheById.mockResolvedValue(null);

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        // researchDocumentWithRetryWorkflow内でcatchされて汎用エラーメッセージになる
        expect(checkResult.errorMessage).toBeTruthy();
      });

      it('最大チャンク数取得失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockRepository.getMaxTotalChunksForDocument.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: '最大チャンク数取得エラー' },
          }),
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('最大チャンク数取得エラー');
      });
    });

    describe('finishReason関連', () => {
      it('planResearchStepのfinishReasonがlengthの場合に適切なエラーメッセージが返ること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [],
          },
          finishReason: 'length',
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('最大出力コンテキストを超え');
      });

      it('generateAnswerStepのfinishReasonがlengthの場合に適切なエラーメッセージが返ること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '',
          finishReason: 'length',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('最大出力コンテキストを超え');
      });

      it('調査タスクが空の場合でもworkflowが完了すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '調査不要な質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [],
          },
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '調査は不要です。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect((result as any).result?.answer).toBe('調査は不要です。');
        expect(mockReviewChatResearchAgent.generateLegacy).not.toHaveBeenCalled();
      });
    });

    describe('複数ドキュメント調査のエラー', () => {
      it('複数ドキュメント調査で一部が失敗した場合にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '複数ドキュメントの質問';

        mockRepository.getReviewDocumentCaches.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockRepository.getReviewDocumentCacheById
          .mockResolvedValueOnce({
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ドキュメント1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          })
          .mockResolvedValueOnce({
            id: 2,
            reviewHistoryId: 'review-1',
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ドキュメント2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          });

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
              {
                reasoning: 'ドキュメント2を調査',
                documentId: '2',
                researchContent: 'ドキュメント2の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        // 1つ目は成功、2つ目は失敗
        let callCount = 0;
        mockReviewChatResearchAgent.generateLegacy.mockImplementation(
          async () => {
            callCount++;
            if (callCount === 1) {
              return {
                text: '調査結果1',
                finishReason: 'stop',
              };
            }
            throw internalError({
              expose: true,
              messageCode: 'PLAIN_MESSAGE',
              messageParams: { message: 'ドキュメント2の調査エラー' },
            });
          },
        );

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ドキュメント2の調査エラー');
        expect(mockReviewChatAnswerAgent.generateLegacy).not.toHaveBeenCalled();
      });
    });

    describe('画像モード特有のエラー', () => {
      it('画像データが空配列の場合でも処理が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '空画像ドキュメントの質問';

        mockRepository.getReviewDocumentCaches.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'empty-image.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: [],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockRepository.getReviewDocumentCacheById.mockResolvedValue({
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'empty-image.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: [],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockRepository.getReviewDocumentCacheByIds.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'empty-image.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: [],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: '空画像ドキュメントを調査',
                documentId: '1',
                researchContent: '空画像の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '画像がありませんでした',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: 'ドキュメントに画像はありません。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
      });

      it('テキストコンテンツと画像データが両方undefinedの場合でも処理が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '空ドキュメントの質問';

        mockRepository.getReviewDocumentCaches.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'empty.pdf',
            processMode: 'text',
            textContent: undefined,
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockRepository.getReviewDocumentCacheById.mockResolvedValue({
          id: 1,
          reviewHistoryId: 'review-1',
          fileName: 'empty.pdf',
          processMode: 'text',
          textContent: undefined,
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockRepository.getReviewDocumentCacheByIds.mockResolvedValue([
          {
            id: 1,
            reviewHistoryId: 'review-1',
            fileName: 'empty.pdf',
            processMode: 'text',
            textContent: undefined,
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ]);

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: '空ドキュメントを調査',
                documentId: '1',
                researchContent: '空ドキュメントの内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: 'ドキュメントは空です',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: 'ドキュメントに内容はありません。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
      });
    });

    describe('境界値テスト', () => {
      it('最大並列数を超える調査タスクが正しく処理されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1];
        const question = '多数のドキュメントの質問';

        // 10個のドキュメントを用意（concurrency: 5を超える）
        const documents = Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          reviewHistoryId: 'review-1',
          fileName: `document${i + 1}.txt`,
          processMode: 'text' as const,
          textContent: `ドキュメント${i + 1}の内容`,
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }));

        mockRepository.getReviewDocumentCaches.mockResolvedValue(documents);

        // getReviewDocumentCacheByIdを各ドキュメントに対して設定
        documents.forEach((doc) => {
          mockRepository.getReviewDocumentCacheById.mockResolvedValueOnce(doc);
        });

        mockRepository.getReviewDocumentCacheByIds.mockResolvedValue(documents);

        // 10個の調査タスクを生成
        const tasks = documents.map((doc) => ({
          reasoning: `ドキュメント${doc.id}を調査`,
          documentId: String(doc.id),
          researchContent: `ドキュメント${doc.id}の内容を調査`,
        }));

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks,
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '全てのドキュメントの調査が完了しました。',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 10個全てのドキュメントが調査されたことを確認
        expect(mockReviewChatResearchAgent.generateLegacy).toHaveBeenCalledTimes(
          10,
        );
      });

      it('チェックリストIDsが1つの場合でも正しく処理されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1]; // 1つだけ
        const question = '単一チェックリストの質問';

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '回答',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
      });

      it('チェックリストIDsが複数の場合でも正しく処理されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const checklistIds = [1, 2, 3]; // 複数
        const question = '複数チェックリストの質問';

        mockRepository.getChecklistResultsWithIndividualResults.mockResolvedValue(
          [
            {
              checklistResult: {
                id: 1,
                content: 'チェック項目1',
                sourceEvaluation: {
                  evaluation: 'A',
                  comment: '良好です',
                },
              },
              individualResults: undefined,
            },
            {
              checklistResult: {
                id: 2,
                content: 'チェック項目2',
                sourceEvaluation: {
                  evaluation: 'B',
                  comment: '改善が必要です',
                },
              },
              individualResults: undefined,
            },
            {
              checklistResult: {
                id: 3,
                content: 'チェック項目3',
                sourceEvaluation: {
                  evaluation: 'C',
                  comment: '要修正です',
                },
              },
              individualResults: undefined,
            },
          ],
        );

        mockReviewChatPlanningAgent.generateLegacy.mockResolvedValue({
          object: {
            tasks: [
              {
                reasoning: 'ドキュメント1を調査',
                documentId: '1',
                researchContent: 'ドキュメント1の内容を調査',
              },
            ],
          },
          finishReason: 'stop',
        });

        mockReviewChatResearchAgent.generateLegacy.mockResolvedValue({
          text: '調査結果',
          finishReason: 'stop',
        });

        mockReviewChatAnswerAgent.generateLegacy.mockResolvedValue({
          text: '回答',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        // Act
        const runtimeContext = new RuntimeContext();
        runtimeContext.set('dataStreamWriter', mockDataStreamWriter);
        runtimeContext.set('toolCallId', 'test-tool-call-id');

        const run = await reviewChatWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            checklistIds,
            question,
          },
          runtimeContext,
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 複数のチェックリストが正しく渡されたことを確認
        expect(
          mockRepository.getChecklistResultsWithIndividualResults,
        ).toHaveBeenCalledWith(reviewHistoryId, checklistIds);
      });
    });
  });
});
