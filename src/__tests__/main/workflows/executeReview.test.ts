/**
 * ドキュメントレビュー実行ワークフローのテスト
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

import { executeReviewWorkflow } from '@/mastra/workflows/sourceReview/executeReview';
import { mastra } from '@/mastra';
import { getReviewRepository } from '@/adapter/db';
import { checkWorkflowResult } from '@/mastra/lib/workflowUtils';
import type { IReviewRepository } from '@/main/service/port/repository/IReviewRepository';
import type { UploadFile, ReviewChecklist } from '@/types';
import { IpcChannels } from '@/types';
import { internalError, repositoryError } from '@/main/lib/error';
import { APICallError } from 'ai';
import {
  DEFAULT_MAX_CONTEXT_LENGTH,
  DEFAULT_MAX_IMAGE_COUNT,
  getModelMaxContextLength,
  getModelMaxImageCount,
} from '@/config/modelConfig';
import { getTokenizer } from '@/main/lib/tokenizer';

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

// withAIControlはパススルー（withAIControl自体は別途テスト済み）
jest.mock('@/mastra/lib/withAIControl', () => ({
  withAIControl: jest.fn((fn: () => any) => fn()),
}));

describe('executeReviewWorkflow', () => {
  // モックリポジトリ
  let mockRepository: jest.Mocked<IReviewRepository>;

  // モックエージェント
  let mockClassifyCategoryAgent: any;
  let mockReviewExecuteAgent: any;
  let mockIndividualDocumentReviewAgent: any;
  let mockConsolidateReviewAgent: any;

  beforeEach(() => {
    // イベントモックのリセット
    mockPublishEvent.mockClear();

    // リポジトリのモック
    mockRepository = {
      createReviewHistory: jest.fn(),
      getReviewHistory: jest.fn().mockResolvedValue({ id: 'review-1' }),
      getAllReviewHistories: jest.fn(),
      updateReviewHistoryTitle: jest.fn(),
      updateReviewHistoryAdditionalInstructionsAndCommentFormat: jest.fn(),
      updateReviewHistoryEvaluationSettings: jest.fn(),
      updateReviewHistoryProcessingStatus: jest.fn(),
      updateReviewHistoryTargetDocumentName: jest
        .fn()
        .mockResolvedValue(undefined),
      deleteReviewHistory: jest.fn(),
      getChecklists: jest.fn(),
      getUncompletedChecklists: jest.fn(),
      createChecklist: jest.fn(),
      updateChecklist: jest.fn(),
      deleteChecklist: jest.fn(),
      deleteSystemCreatedChecklists: jest.fn(),
      upsertReviewResult: jest.fn().mockResolvedValue(undefined),
      upsertReviewErrors: jest.fn().mockResolvedValue(undefined),
      getReviewChecklistResults: jest.fn(),
      deleteAllReviewResults: jest.fn().mockResolvedValue(undefined),
      clearReviewResultsByChecklistIds: jest.fn(),
      deleteReviewDocumentCaches: jest.fn().mockResolvedValue(undefined),
      deleteReviewLargedocumentResultCaches: jest
        .fn()
        .mockResolvedValue(undefined),
      deleteReviewLargedocumentResultCachesByChecklistIds: jest.fn(),
      updateReviewHistoryDocumentMode: jest.fn().mockResolvedValue(undefined),
      createReviewDocumentCache: jest.fn(),
      getReviewDocumentCaches: jest.fn(),
      getReviewDocumentCacheById: jest.fn(),
      getReviewDocumentCacheByIds: jest.fn(),
      createReviewLargedocumentResultCache: jest
        .fn()
        .mockResolvedValue(undefined),
      getReviewLargedocumentResultCaches: jest.fn(),
      getMaxTotalChunksForDocument: jest.fn(),
      getChecklistResultsWithIndividualResults: jest.fn(),
      getReviewDocumentCacheInfos: jest.fn(),
      updateReviewHistoryConcurrentChecklistCount: jest
        .fn()
        .mockResolvedValue(undefined),
    } as jest.Mocked<IReviewRepository>;

    (getReviewRepository as jest.Mock).mockReturnValue(mockRepository);

    // FileTextExtractorのモック
    mockExtract.mockResolvedValue({
      content: 'テストファイルの内容',
      images: [],
      strategyUsed: 'txt-default',
      formatType: 'txt-plain',
    });

    // Mastraエージェントのモック
    mockClassifyCategoryAgent = {
      generateLegacy: jest.fn(),
    };
    mockReviewExecuteAgent = {
      generateLegacy: jest.fn(),
    };
    mockIndividualDocumentReviewAgent = {
      generateLegacy: jest.fn(),
    };
    mockConsolidateReviewAgent = {
      generateLegacy: jest.fn(),
    };

    // mastra.getAgentのモック
    jest.spyOn(mastra, 'getAgent').mockImplementation((agentName: string) => {
      if (agentName === 'classifyCategoryAgent') {
        return mockClassifyCategoryAgent;
      }
      if (agentName === 'reviewExecuteAgent') {
        return mockReviewExecuteAgent;
      }
      if (agentName === 'individualDocumentReviewAgent') {
        return mockIndividualDocumentReviewAgent;
      }
      if (agentName === 'consolidateReviewAgent') {
        return mockConsolidateReviewAgent;
      }
      throw new Error(`Unknown agent: ${agentName}`);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockExtract.mockReset();
  });

  describe('少量ドキュメントモード（small）', () => {
    describe('正常系', () => {
      it('基本的なレビュー実行が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 3,
            content: 'チェック項目3',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // MAX_CHECKLISTS_PER_CATEGORY = 1なので手動分割
        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: 'コメント1',
              evaluation: 'A',
            },
            {
              checklistId: 2,
              reviewSections: [],
              comment: 'コメント2',
              evaluation: 'B',
            },
            {
              checklistId: 3,
              reviewSections: [],
              comment: 'コメント3',
              evaluation: 'C',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // DB操作の確認
        expect(
          mockRepository.deleteReviewLargedocumentResultCaches,
        ).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteReviewDocumentCaches).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(mockRepository.deleteAllReviewResults).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(
          mockRepository.updateReviewHistoryDocumentMode,
        ).toHaveBeenCalledWith(reviewHistoryId, 'small');
        expect(mockRepository.createReviewDocumentCache).toHaveBeenCalled();
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();

        // ファイル処理進捗イベントが発行されたことを検証
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'processing',
            currentFileIndex: 0,
            totalFiles: 1,
            currentFileName: 'document.txt',
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

      it('複数ファイルの統合レビューが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document1.txt',
            path: '/test/document1.txt',
            type: 'text/plain',
            processMode: 'text',
          },
          {
            id: 'file-2',
            name: 'document2.txt',
            path: '/test/document2.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache
          .mockResolvedValueOnce({
            id: 1,
            reviewHistoryId,
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ファイル1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          })
          .mockResolvedValueOnce({
            id: 2,
            reviewHistoryId,
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ファイル2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          });

        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: 'コメント1',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockExtract).toHaveBeenCalledTimes(2);
        expect(mockRepository.createReviewDocumentCache).toHaveBeenCalledTimes(
          2,
        );
        expect(
          mockRepository.updateReviewHistoryTargetDocumentName,
        ).toHaveBeenCalledWith(reviewHistoryId, 'document1.txt/document2.txt');

        // 各ファイルに対してファイル処理進捗イベントが発行されたことを検証
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'processing',
            currentFileIndex: 0,
            totalFiles: 2,
            currentFileName: 'document1.txt',
          }),
        );
        expect(mockPublishEvent).toHaveBeenCalledWith(
          IpcChannels.REVIEW_FILE_PROCESSING_PROGRESS,
          expect.objectContaining({
            reviewHistoryId,
            phase: 'processing',
            currentFileIndex: 1,
            totalFiles: 2,
            currentFileName: 'document2.txt',
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

      it('画像モード（ページ別）でのレビューが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.pdf',
            path: '/test/document.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'pages',
            imageData: [
              'data:image/png;base64,page1',
              'data:image/png;base64,page2',
              'data:image/png;base64,page3',
            ],
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '画像レビュー',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockExtract).not.toHaveBeenCalled();

        // reviewExecuteAgentに画像データが渡されることを確認
        const callArgs = mockReviewExecuteAgent.generateLegacy.mock.calls[0];
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
            expect.objectContaining({
              type: 'image',
              image: 'data:image/png;base64,page3',
            }),
          ]),
        );
      });

      it('カスタム評定項目を使用したレビューが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const evaluationSettings = {
          items: [
            { label: '優', description: '優れている' },
            { label: '良', description: '良好' },
            { label: '可', description: '可もなく不可もなく' },
            { label: '不可', description: '改善が必要' },
          ],
        };

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: 'カスタム評定',
              evaluation: '優',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
            evaluationSettings,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // runtimeContextにevaluationSettingsが設定されていることを確認
        const callArgs = mockReviewExecuteAgent.generateLegacy.mock.calls[0];
        const options = callArgs[1];
        expect(options.runtimeContext.get('evaluationSettings')).toEqual(
          evaluationSettings,
        );
      });

      it('追加指示とコメントフォーマット指定が正しく動作すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const additionalInstructions =
          'セキュリティの観点で厳しくレビューしてください';
        const commentFormat = '- 問題点:\n- 推奨事項:';

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '- 問題点: なし\n- 推奨事項: なし',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
            additionalInstructions,
            commentFormat,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // runtimeContextに設定されていることを確認
        const callArgs = mockReviewExecuteAgent.generateLegacy.mock.calls[0];
        const options = callArgs[1];
        expect(options.runtimeContext.get('additionalInstructions')).toBe(
          additionalInstructions,
        );
        expect(options.runtimeContext.get('commentFormat')).toBe(commentFormat);
      });

      it('レビュー結果に未含まれチェックリストの再試行が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 3,
            content: 'チェック項目3',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // MAX_CHECKLISTS_PER_CATEGORY = 1 なので、3つのカテゴリに分割される
        // カテゴリ1(ID=1): 1回目空、2回目成功
        // カテゴリ2(ID=2): 1回目成功
        // カテゴリ3(ID=3): 1回目成功
        const attemptsByChecklist = new Map<number, number>();
        mockReviewExecuteAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const runtimeContext = options?.runtimeContext;
            const checklistItems = runtimeContext?.get('checklistItems') ?? [];
            const targetId: number | undefined = checklistItems[0]?.id;
            if (!targetId) {
              return {
                object: [],
                finishReason: 'stop',
              };
            }

            const attempt = attemptsByChecklist.get(targetId) ?? 0;
            attemptsByChecklist.set(targetId, attempt + 1);

            if (targetId === 1 && attempt === 0) {
              return {
                object: [],
                finishReason: 'stop',
              };
            }

            const evaluationMap: Record<number, string> = {
              1: 'A',
              2: 'B',
              3: 'C',
            };

            return {
              object: [
                {
                  checklistId: targetId,
                  reviewSections: [],
                  comment: `コメント${targetId}`,
                  evaluation: evaluationMap[targetId] ?? 'A',
                },
              ],
              finishReason: 'stop',
            };
          },
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockReviewExecuteAgent.generateLegacy).toHaveBeenCalledTimes(4); // カテゴリ1が2回、他が1回ずつ
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
      });
    });

    describe('異常系', () => {
      it('テキスト抽出失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];

        mockExtract.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'ファイル読み込みエラー' },
          }),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('ファイル読み込みエラー');
      });

      it('チェックリスト取得失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];

        mockRepository.getChecklists.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'DB接続エラー' },
          }),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('DB接続エラー');
      });

      it('チェックリストが存在しない場合にエラーになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue([]);

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          '対象のチェックリストが存在しないためレビューを実行できませんでした',
        );
      });

      it('例外が発生した場合、チェックリストのエラーがDBに保存されworkflowがsuccessになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewExecuteAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'AI APIエラー' },
          }),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // エラーがDBに保存されること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('AI APIエラー'),
            }),
          ]),
        );
      });

      it('AIの出力にレビュー結果が含まれない場合（最大試行回数超過）、対象チェックリストのエラーがDBに保存されworkflowがsuccessになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 3回とも ID 1のみ返却（ID 2は常に未完了）
        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: 'コメント1',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 未完了のチェックリスト（ID: 2）のみエラーがDBに保存されること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 2,
              errorMessage: 'AIの出力にレビュー結果が含まれませんでした',
            }),
          ]),
        );
        // ID 1 はエラー保存されないこと（成功済み）
        const upsertErrorsCalls = mockRepository.upsertReviewErrors.mock.calls;
        for (const call of upsertErrorsCalls) {
          for (const error of call[0]) {
            expect(error.reviewChecklistId).not.toBe(1);
          }
        }
      });

      it('finishReasonがlengthの場合、チェックリストのエラーがDBに保存されworkflowがsuccessになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [],
          finishReason: 'length',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // エラーがDBに保存されること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage:
                expect.stringContaining('最大出力コンテキストを超えました'),
            }),
          ]),
        );
      });

      it('画像モード（統合画像）でのレビューが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.pdf',
            path: '/test/document.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'merged',
            imageData: ['data:image/png;base64,merged'],
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '統合画像レビュー',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockExtract).not.toHaveBeenCalled();

        // reviewExecuteAgentに統合画像データが渡されることを確認
        const callArgs = mockReviewExecuteAgent.generateLegacy.mock.calls[0];
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

      it('createReviewDocumentCache失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockRejectedValue(
          new Error('キャッシュ保存エラー'),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        // map内でのエラーは不明なエラーとしてキャッチされる
        expect(checkResult.errorMessage).toBeTruthy();
      });

      it('upsertReviewResult失敗時にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: 'コメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        mockRepository.upsertReviewResult.mockRejectedValue(
          repositoryError('レビュー結果保存エラー', new Error('DB error')),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('レビュー結果保存エラー');
      });
    });

    describe('リトライモード', () => {
      it('retryMode=allで既存キャッシュを利用して全てのチェックリストを再実行できること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const cachedDocuments = [
          {
            id: 10,
            reviewHistoryId,
            fileName: 'cached-doc.txt',
            processMode: 'text' as const,
            textContent: 'キャッシュ済みテキスト',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getReviewDocumentCaches.mockResolvedValue(
          cachedDocuments,
        );
        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: 'リトライコメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            retryMode: 'all',
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        const executedChecklistIds =
          mockReviewExecuteAgent.generateLegacy.mock.calls.flatMap(
            ([, options]: [any, any]) =>
              (
                (options.runtimeContext.get('checklistItems') ||
                  []) as ReviewChecklist[]
              ).map((item) => item.id),
          );
        expect(new Set(executedChecklistIds)).toEqual(
          new Set(checklists.map((checklist) => checklist.id)),
        );
        expect(
          mockRepository.deleteReviewLargedocumentResultCaches,
        ).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteAllReviewResults).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(
          mockRepository.deleteReviewDocumentCaches,
        ).not.toHaveBeenCalled();
        expect(mockRepository.createReviewDocumentCache).not.toHaveBeenCalled();
        expect(mockRepository.getReviewDocumentCaches).toHaveBeenCalled();
        expect(mockRepository.getChecklists).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(mockRepository.getUncompletedChecklists).not.toHaveBeenCalled();
        expect(
          mockRepository.deleteReviewLargedocumentResultCachesByChecklistIds,
        ).not.toHaveBeenCalled();
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
        expect(mockExtract).not.toHaveBeenCalled();
      });

      it('retryMode=uncompleted-onlyで未済チェックリストのみを再実行できること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const cachedDocuments = [
          {
            id: 20,
            reviewHistoryId,
            fileName: 'cached-doc.txt',
            processMode: 'text' as const,
            textContent: 'キャッシュ済みテキスト',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const uncompletedChecklists: ReviewChecklist[] = [
          {
            id: 2,
            content: '未済チェック項目',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getReviewDocumentCaches.mockResolvedValue(
          cachedDocuments,
        );
        mockRepository.getUncompletedChecklists.mockResolvedValue(
          uncompletedChecklists,
        );
        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 2,
              reviewSections: [],
              comment: '未済リトライコメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            retryMode: 'uncompleted-only',
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        const executedChecklistIds =
          mockReviewExecuteAgent.generateLegacy.mock.calls.flatMap(
            ([, options]: [any, any]) =>
              (
                (options.runtimeContext.get('checklistItems') ||
                  []) as ReviewChecklist[]
              ).map((item) => item.id),
          );
        expect(executedChecklistIds).toEqual([2]);
        expect(
          mockRepository.deleteReviewLargedocumentResultCachesByChecklistIds,
        ).toHaveBeenCalledWith(reviewHistoryId, [2]);
        expect(
          mockRepository.deleteReviewLargedocumentResultCaches,
        ).not.toHaveBeenCalled();
        expect(mockRepository.deleteAllReviewResults).not.toHaveBeenCalled();
        expect(
          mockRepository.deleteReviewDocumentCaches,
        ).not.toHaveBeenCalled();
        expect(mockRepository.createReviewDocumentCache).not.toHaveBeenCalled();
        expect(mockRepository.getUncompletedChecklists).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(mockRepository.getChecklists).not.toHaveBeenCalled();
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
        expect(mockExtract).not.toHaveBeenCalled();
      });
    });
  });

  describe('大量ドキュメントモード（large）', () => {
    describe('正常系', () => {
      it('個別ドキュメントレビューと統合が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document1.txt',
            path: '/test/document1.txt',
            type: 'text/plain',
            processMode: 'text',
          },
          {
            id: 'file-2',
            name: 'document2.txt',
            path: '/test/document2.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache
          .mockResolvedValueOnce({
            id: 1,
            reviewHistoryId,
            fileName: 'document1.txt',
            processMode: 'text',
            textContent: 'ファイル1の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          })
          .mockResolvedValueOnce({
            id: 2,
            reviewHistoryId,
            fileName: 'document2.txt',
            processMode: 'text',
            textContent: 'ファイル2の内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          });

        // 個別ドキュメントレビュー
        // 実行時のコンテキスト（対象チェックリスト）に応じて適切な結果を返す
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') || [];
            // 実際に対象となっているチェックリストIDのみの結果を返す
            return {
              object: checklistItems.map((item: any) => ({
                reviewSections: [],
                checklistId: item.id,
                comment: `個別コメント${item.id}`,
              })),
              finishReason: 'stop',
            };
          },
        );

        // 統合レビュー
        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント1', evaluation: 'A' },
            { checklistId: 2, comment: '統合コメント2', evaluation: 'B' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(4); // 2ファイル × 2カテゴリ
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalledTimes(
          2,
        ); // 2カテゴリ

        // 個別レビュー結果キャッシュ保存の詳細検証
        // 2ファイル × 2チェックリスト = 4回呼ばれる
        expect(
          mockRepository.createReviewLargedocumentResultCache,
        ).toHaveBeenCalledTimes(4);

        // 各ドキュメントキャッシュIDに対して正しく保存されることを確認
        const largeDocCacheCalls =
          mockRepository.createReviewLargedocumentResultCache.mock.calls;

        // document1 (cacheId=1) に対するキャッシュ保存 (2チェックリスト = 2回)
        const doc1Calls = largeDocCacheCalls.filter(
          (call) => call[0].reviewDocumentCacheId === 1,
        );
        expect(doc1Calls.length).toBe(2);
        expect(doc1Calls).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 1,
                reviewChecklistId: 1,
                comment: '個別コメント1',
                totalChunks: 1,
                chunkIndex: 0,
              }),
            ]),
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 1,
                reviewChecklistId: 2,
                comment: '個別コメント2',
                totalChunks: 1,
                chunkIndex: 0,
              }),
            ]),
          ]),
        );

        // document2 (cacheId=2) に対するキャッシュ保存 (2チェックリスト = 2回)
        const doc2Calls = largeDocCacheCalls.filter(
          (call) => call[0].reviewDocumentCacheId === 2,
        );
        expect(doc2Calls.length).toBe(2);
        expect(doc2Calls).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 2,
                reviewChecklistId: 1,
                comment: '個別コメント1',
                totalChunks: 1,
                chunkIndex: 0,
              }),
            ]),
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 2,
                reviewChecklistId: 2,
                comment: '個別コメント2',
                totalChunks: 1,
                chunkIndex: 0,
              }),
            ]),
          ]),
        );

        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
      });

      it('ドキュメント自動分割（テキスト）が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'large-document.txt',
            path: '/test/large-document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockExtract.mockResolvedValue({
          content: 'A'.repeat(10000), // 長いテキスト
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'txt-plain',
        });
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'large-document.txt',
            processMode: 'text',
            textContent: 'A'.repeat(10000),
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        // 1回目: コンテキスト長エラー例外をthrow
        // 2回目以降: 分割後の各チャンクで成功 (documentIdを含める)
        let callCount = 0;
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (message: any) => {
            callCount++;
            if (callCount === 1) {
              // コンテキスト長エラーを示すAPICallErrorをthrow
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
            // documentIdを生成（分割後のドキュメント用）
            const textContent =
              message.content.find((c: any) => c.type === 'text')?.text || '';
            const isPart = textContent.includes('part');
            const partMatch = textContent.match(/part (\d+)/);
            const documentId =
              isPart && partMatch ? `1_part${partMatch[1]}` : '1';

            return {
              object: [
                {
                  reviewSections: [],
                  checklistId: 1,
                  comment: '分割後コメント',
                  documentId,
                },
              ],
              finishReason: 'stop',
            };
          },
        );

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント', evaluation: 'A' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 1回目失敗 + 2回目は2分割して成功 = 3回呼ばれる
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(3);
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();

        // 分割後の個別レビュー結果キャッシュ保存の検証
        // 2つの分割チャンクに対して各1チェックリスト = 2回呼ばれる
        expect(
          mockRepository.createReviewLargedocumentResultCache,
        ).toHaveBeenCalledTimes(2);

        const splitCacheCalls =
          mockRepository.createReviewLargedocumentResultCache.mock.calls;

        // part1のキャッシュ保存検証
        expect(splitCacheCalls).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 1,
                reviewChecklistId: 1,
                comment: '分割後コメント',
                totalChunks: 2,
                chunkIndex: 0,
                individualFileName: expect.stringContaining('part 1'),
              }),
            ]),
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 1,
                reviewChecklistId: 1,
                comment: '分割後コメント',
                totalChunks: 2,
                chunkIndex: 1,
                individualFileName: expect.stringContaining('part 2'),
              }),
            ]),
          ]),
        );
      });

      it('ドキュメント自動分割（画像）が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'large-pdf.pdf',
            path: '/test/large-pdf.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'pages',
            imageData: Array(20).fill('data:image/png;base64,page'), // 20ページ
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'large-pdf.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: Array(20).fill('data:image/png;base64,page'),
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        // 1回目: コンテキスト長エラー例外をthrow
        // 2回目以降: 分割後の各チャンクで成功 (documentIdを含める)
        let callCount = 0;
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (message: any) => {
            callCount++;
            if (callCount === 1) {
              // 画像が多すぎるエラーを示すAPICallErrorをthrow
              throw new APICallError({
                message: 'Too many images',
                url: 'http://test-api',
                requestBodyValues: {},
                statusCode: 400,
                responseBody: JSON.stringify({
                  error: 'too many images in request',
                }),
                cause: new Error('too many images'),
                isRetryable: false,
              });
            }
            // documentIdを生成（分割後のドキュメント用）
            const textContent =
              message.content.find((c: any) => c.type === 'text')?.text || '';
            const isPart = textContent.includes('part');
            const partMatch = textContent.match(/part (\d+)/);
            const documentId =
              isPart && partMatch ? `1_part${partMatch[1]}` : '1';

            return {
              object: [
                {
                  reviewSections: [],
                  checklistId: 1,
                  comment: '分割後コメント',
                  documentId,
                },
              ],
              finishReason: 'stop',
            };
          },
        );

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント', evaluation: 'A' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 1回目失敗 + 2回目は2分割して成功 = 3回呼ばれる
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(3);
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();

        // 分割後の個別レビュー結果キャッシュ保存の検証（画像）
        // 2つの分割チャンクに対して各1チェックリスト = 2回呼ばれる
        expect(
          mockRepository.createReviewLargedocumentResultCache,
        ).toHaveBeenCalledTimes(2);

        const imageSplitCacheCalls =
          mockRepository.createReviewLargedocumentResultCache.mock.calls;

        // 画像分割のキャッシュ保存検証
        expect(imageSplitCacheCalls).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 1,
                reviewChecklistId: 1,
                comment: '分割後コメント',
                totalChunks: 2,
                chunkIndex: 0,
                individualFileName: expect.stringContaining('part 1'),
              }),
            ]),
            expect.arrayContaining([
              expect.objectContaining({
                reviewDocumentCacheId: 1,
                reviewChecklistId: 1,
                comment: '分割後コメント',
                totalChunks: 2,
                chunkIndex: 1,
                individualFileName: expect.stringContaining('part 2'),
              }),
            ]),
          ]),
        );
      });

      it('追加指示とコメントフォーマット指定が正しく動作すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const additionalInstructions =
          'セキュリティの観点で厳しくレビューしてください';
        const commentFormat = '- 問題点:\n- 推奨事項:';

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント' },
          ],
          finishReason: 'stop',
        });

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              comment: '- 問題点: なし\n- 推奨事項: なし',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
            additionalInstructions,
            commentFormat,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // individualDocumentReviewAgentに設定されていることを確認
        const individualCallArgs =
          mockIndividualDocumentReviewAgent.generateLegacy.mock.calls[0];
        const individualOptions = individualCallArgs[1];
        expect(
          individualOptions.runtimeContext.get('additionalInstructions'),
        ).toBe(additionalInstructions);
        expect(individualOptions.runtimeContext.get('commentFormat')).toBe(
          commentFormat,
        );

        // consolidateReviewAgentに設定されていることを確認
        const consolidateCallArgs =
          mockConsolidateReviewAgent.generateLegacy.mock.calls[0];
        const consolidateOptions = consolidateCallArgs[1];
        expect(
          consolidateOptions.runtimeContext.get('additionalInstructions'),
        ).toBe(additionalInstructions);
        expect(consolidateOptions.runtimeContext.get('commentFormat')).toBe(
          commentFormat,
        );
      });

      it('カスタム評定項目を使用したレビューが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const evaluationSettings = {
          items: [
            { label: '優', description: '優れている' },
            { label: '良', description: '良好' },
            { label: '可', description: '可もなく不可もなく' },
            { label: '不可', description: '改善が必要' },
          ],
        };

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント' },
          ],
          finishReason: 'stop',
        });

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: 'カスタム評定', evaluation: '優' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
            evaluationSettings,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // consolidateReviewAgentにevaluationSettingsが設定されていることを確認
        const consolidateCallArgs =
          mockConsolidateReviewAgent.generateLegacy.mock.calls[0];
        const consolidateOptions = consolidateCallArgs[1];
        expect(
          consolidateOptions.runtimeContext.get('evaluationSettings'),
        ).toEqual(evaluationSettings);
      });

      it('統合画像（merged）での大量ドキュメントレビューが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.pdf',
            path: '/test/document.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'merged',
            imageData: ['data:image/png;base64,merged'],
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: ['data:image/png;base64,merged'],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント' },
          ],
          finishReason: 'stop',
        });

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント', evaluation: 'A' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockExtract).not.toHaveBeenCalled();

        // individualDocumentReviewAgentに統合画像データが渡されることを確認
        const callArgs =
          mockIndividualDocumentReviewAgent.generateLegacy.mock.calls[0];
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

      it('テキストと画像が混在する大量ドキュメントレビューが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
          {
            id: 'file-2',
            name: 'diagram.pdf',
            path: '/test/diagram.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'pages',
            imageData: [
              'data:image/png;base64,page1',
              'data:image/png;base64,page2',
            ],
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockExtract.mockResolvedValueOnce({
          content: 'テキストドキュメントの内容',
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'txt-plain',
        });

        mockRepository.createReviewDocumentCache
          .mockResolvedValueOnce({
            id: 1,
            reviewHistoryId,
            fileName: 'document.txt',
            processMode: 'text',
            textContent: 'テキストドキュメントの内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          })
          .mockResolvedValueOnce({
            id: 2,
            reviewHistoryId,
            fileName: 'diagram.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData: [
              'data:image/png;base64,page1',
              'data:image/png;base64,page2',
            ],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          });

        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems: ReviewChecklist[] =
              options.runtimeContext.get('checklistItems') || [];
            const targetId = checklistItems[0]?.id ?? 1;
            return {
              object: [
                {
                  reviewSections: [],
                  checklistId: targetId,
                  comment: `個別コメント${targetId}`,
                },
              ],
              finishReason: 'stop',
            };
          },
        );

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント1', evaluation: 'A' },
            { checklistId: 2, comment: '統合コメント2', evaluation: 'B' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockExtract).toHaveBeenCalledTimes(1);
        expect(mockRepository.createReviewDocumentCache).toHaveBeenCalledTimes(
          2,
        );
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(files.length * checklists.length);
        expect(
          mockRepository.createReviewLargedocumentResultCache,
        ).toHaveBeenCalledTimes(files.length * checklists.length);
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
      });

      it('retryMode=allでテキストと画像のキャッシュを利用した大量ドキュメントリトライが成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const cachedDocuments = [
          {
            id: 10,
            reviewHistoryId,
            fileName: 'cached-doc.txt',
            processMode: 'text' as const,
            textContent: 'キャッシュ済みテキスト',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 11,
            reviewHistoryId,
            fileName: 'diagram.pdf',
            processMode: 'image' as const,
            textContent: undefined,
            imageData: [
              'data:image/png;base64,page1',
              'data:image/png;base64,page2',
            ],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getReviewDocumentCaches.mockResolvedValue(
          cachedDocuments,
        );
        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems = (options.runtimeContext.get(
              'checklistItems',
            ) || []) as ReviewChecklist[];
            return {
              object: checklistItems.map((item) => ({
                reviewSections: [],
                checklistId: item.id,
                comment: `個別コメント${item.id}`,
              })),
              finishReason: 'stop',
            };
          },
        );

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント1', evaluation: 'A' },
            { checklistId: 2, comment: '統合コメント2', evaluation: 'B' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            retryMode: 'all',
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockExtract).not.toHaveBeenCalled();
        expect(mockRepository.createReviewDocumentCache).not.toHaveBeenCalled();
        expect(
          mockRepository.deleteReviewLargedocumentResultCaches,
        ).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteAllReviewResults).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(
          mockRepository.deleteReviewDocumentCaches,
        ).not.toHaveBeenCalled();
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(cachedDocuments.length * checklists.length);
        const executedChecklistIds = new Set(
          mockIndividualDocumentReviewAgent.generateLegacy.mock.calls.flatMap(
            ([, options]: [any, any]) =>
              (
                (options.runtimeContext.get('checklistItems') ||
                  []) as ReviewChecklist[]
              ).map((item) => item.id),
          ),
        );
        expect(executedChecklistIds).toEqual(
          new Set(checklists.map((item) => item.id)),
        );
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
      });

      it('retryMode=uncompleted-onlyで大量ドキュメントの未済チェックリストのみリトライできること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const cachedDocuments = [
          {
            id: 20,
            reviewHistoryId,
            fileName: 'cached-doc.txt',
            processMode: 'text' as const,
            textContent: 'キャッシュ済みテキスト',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 21,
            reviewHistoryId,
            fileName: 'diagram.pdf',
            processMode: 'image' as const,
            textContent: undefined,
            imageData: ['data:image/png;base64,page1'],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: '完了済み',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: '未済項目',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getReviewDocumentCaches.mockResolvedValue(
          cachedDocuments,
        );
        mockRepository.getUncompletedChecklists.mockResolvedValue([
          checklists[1],
        ]);
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems = (options.runtimeContext.get(
              'checklistItems',
            ) || []) as ReviewChecklist[];
            return {
              object: checklistItems.map((item) => ({
                reviewSections: [],
                checklistId: item.id,
                comment: `未済コメント${item.id}`,
              })),
              finishReason: 'stop',
            };
          },
        );

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 2, comment: '統合コメント2', evaluation: 'B' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            retryMode: 'uncompleted-only',
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockExtract).not.toHaveBeenCalled();
        expect(mockRepository.createReviewDocumentCache).not.toHaveBeenCalled();
        expect(
          mockRepository.deleteReviewLargedocumentResultCachesByChecklistIds,
        ).toHaveBeenCalledWith(reviewHistoryId, [2]);
        expect(
          mockRepository.deleteReviewLargedocumentResultCaches,
        ).not.toHaveBeenCalled();
        expect(mockRepository.deleteAllReviewResults).not.toHaveBeenCalled();
        expect(
          mockRepository.deleteReviewDocumentCaches,
        ).not.toHaveBeenCalled();
        expect(mockRepository.getChecklists).not.toHaveBeenCalled();
        expect(mockRepository.getUncompletedChecklists).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        const executedChecklistIds = new Set(
          mockIndividualDocumentReviewAgent.generateLegacy.mock.calls.flatMap(
            ([, options]: [any, any]) =>
              (
                (options.runtimeContext.get('checklistItems') ||
                  []) as ReviewChecklist[]
              ).map((item) => item.id),
          ),
        );
        expect(executedChecklistIds).toEqual(new Set([2]));
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
      });

      it('個別レビューでの未完了チェックリスト再試行が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 1回目: ID 1のみ返却
        // 2回目: ID 2を返却
        mockIndividualDocumentReviewAgent.generateLegacy
          .mockResolvedValueOnce({
            object: [
              { reviewSections: [], checklistId: 1, comment: '個別コメント1' },
            ],
            finishReason: 'stop',
          })
          .mockResolvedValueOnce({
            object: [
              { reviewSections: [], checklistId: 2, comment: '個別コメント2' },
            ],
            finishReason: 'stop',
          });

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント1', evaluation: 'A' },
            { checklistId: 2, comment: '統合コメント2', evaluation: 'B' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(2);
      });

      it('統合レビューでの未完了チェックリスト再試行が成功すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント1' },
            { reviewSections: [], checklistId: 2, comment: '個別コメント2' },
          ],
          finishReason: 'stop',
        });

        // 1回目: ID 1のみ返却
        // 2回目: ID 2を返却
        mockConsolidateReviewAgent.generateLegacy
          .mockResolvedValueOnce({
            object: [
              { checklistId: 1, comment: '統合コメント1', evaluation: 'A' },
            ],
            finishReason: 'stop',
          })
          .mockResolvedValueOnce({
            object: [
              { checklistId: 2, comment: '統合コメント2', evaluation: 'B' },
            ],
            finishReason: 'stop',
          });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalledTimes(
          2,
        );
      });

      it('新規実行時のキャッシュクリア→保存フローが正しく動作すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント' },
          ],
          finishReason: 'stop',
        });

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント', evaluation: 'A' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 削除処理が呼ばれていることを確認
        expect(
          mockRepository.deleteReviewLargedocumentResultCaches,
        ).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteReviewDocumentCaches).toHaveBeenCalledWith(
          reviewHistoryId,
        );
        expect(mockRepository.deleteAllReviewResults).toHaveBeenCalledWith(
          reviewHistoryId,
        );

        // documentMode保存が呼ばれていることを確認
        expect(
          mockRepository.updateReviewHistoryDocumentMode,
        ).toHaveBeenCalledWith(reviewHistoryId, 'large');

        // ドキュメントキャッシュが保存されていることを確認
        expect(mockRepository.createReviewDocumentCache).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId,
            fileName: 'document.txt',
            processMode: 'text',
            textContent: 'テストファイルの内容',
          }),
        );

        // 個別レビュー結果キャッシュが保存されていることを確認
        expect(
          mockRepository.createReviewLargedocumentResultCache,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewDocumentCacheId: 1,
            reviewChecklistId: 1,
            comment: '個別コメント',
          }),
        );
      });
    });

    describe('異常系', () => {
      it('個別ドキュメントレビューで例外が発生した場合、オリジナルドキュメント名付きエラーがDBに保存されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: '個別レビューエラー' },
          }),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // エラーがDBに保存されること（ドキュメント名付き）
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('document.txt'),
            }),
          ]),
        );
      });

      it('統合レビューステップで例外が発生した場合、チェックリストエラーがDBに保存されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント' },
          ],
          finishReason: 'stop',
        });

        mockConsolidateReviewAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: '統合レビューエラー' },
          }),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // エラーがDBに保存されること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('統合レビューエラー'),
            }),
          ]),
        );
      });

      it('コンテキスト長エラーでリトライ回数超過の場合、オリジナルドキュメント名付きエラーがDBに保存されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'document.txt',
            processMode: 'text',
            textContent: 'テストファイルの内容',
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        // 常にコンテキスト長エラー例外をthrow (最大5回リトライまで)
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
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
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        // PBI #1: 分割上限到達時はfailedステータスで全体が終了する
        expect(checkResult.status).toBe('failed');
        // エラーがDBに保存されること（ドキュメント名付き）
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('document.txt'),
            }),
          ]),
        );
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              errorMessage: expect.stringContaining(
                'コンテキスト長エラーが解消されませんでした',
              ),
            }),
          ]),
        );
      });

      it('個別レビュー最大試行回数超過の場合、オリジナルドキュメント名付きエラーがDBに保存されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 3回ともID 1のみ返却（ID 2は常に未完了）
        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント1' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 未完了のチェックリスト（ID: 2）のエラーがDBに保存されること（ドキュメント名付きフォーマット検証）
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 2,
              errorMessage: expect.stringMatching(
                /document\.txtの処理中にエラー:\nAIの出力にレビュー結果が含まれませんでした/,
              ),
              documentOriginalName: 'document.txt',
            }),
          ]),
        );
      });

      it('統合レビュー最大試行回数超過の場合、チェックリストエラーがDBに保存されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { reviewSections: [], checklistId: 1, comment: '個別コメント1' },
            { reviewSections: [], checklistId: 2, comment: '個別コメント2' },
          ],
          finishReason: 'stop',
        });

        // 3回ともID 1のみ返却（ID 2は常に未完了）
        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント1', evaluation: 'A' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 未完了のチェックリスト（ID: 2）のエラーがDBに保存されること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 2,
              errorMessage: expect.stringContaining(
                'AIの出力に統合レビュー結果が含まれませんでした',
              ),
            }),
          ]),
        );
      });
    });
  });

  describe('カテゴリ分類関連', () => {
    it('カテゴリ分類AIエラー時の手動分割フォールバックが成功すること', async () => {
      // Arrange
      const reviewHistoryId = 'review-1';
      const files: UploadFile[] = [
        {
          id: 'file-1',
          name: 'document.txt',
          path: '/test/document.txt',
          type: 'text/plain',
          processMode: 'text',
        },
      ];
      const checklists: ReviewChecklist[] = [
        {
          id: 1,
          content: 'チェック項目1',
          createdBy: 'user',
          reviewHistoryId,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 2,
          content: 'チェック項目2',
          createdBy: 'user',
          reviewHistoryId,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      mockRepository.getChecklists.mockResolvedValue(checklists);
      mockRepository.createReviewDocumentCache.mockResolvedValue({
        id: 1,
        reviewHistoryId,
        fileName: 'document.txt',
        processMode: 'text',
        textContent: 'テストファイルの内容',
        imageData: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      // classifyCategoryAgentをエラーにする
      mockClassifyCategoryAgent.generateLegacy.mockRejectedValue(
        internalError({
          expose: true,
          messageCode: 'PLAIN_MESSAGE',
          messageParams: { message: 'AI APIエラー' },
        }),
      );

      mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
        object: [
          {
            checklistId: 1,
            reviewSections: [],
            comment: 'コメント1',
            evaluation: 'A',
          },
          {
            checklistId: 2,
            reviewSections: [],
            comment: 'コメント2',
            evaluation: 'B',
          },
        ],
        finishReason: 'stop',
      });

      // Act
      const run = await executeReviewWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentMode: 'small',
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      expect(checkResult.status).toBe('success');
      // 手動分割でもレビューが成功すること
      expect(mockReviewExecuteAgent.generateLegacy).toHaveBeenCalled();
    });
  });

  describe('エッジケース', () => {
    it('カテゴリ分類でAIが全IDを返さない場合、その他カテゴリに含まれること', async () => {
      // Arrange
      const reviewHistoryId = 'review-1';
      const files: UploadFile[] = [
        {
          id: 'file-1',
          name: 'document.txt',
          path: '/test/document.txt',
          type: 'text/plain',
          processMode: 'text',
        },
      ];
      // 3件のチェックリスト、concurrentChecklistCount=2でAIに分類させる
      const checklists: ReviewChecklist[] = [
        {
          id: 1,
          content: 'チェック項目1',
          createdBy: 'user',
          reviewHistoryId,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 2,
          content: 'チェック項目2',
          createdBy: 'user',
          reviewHistoryId,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 3,
          content: 'チェック項目3',
          createdBy: 'user',
          reviewHistoryId,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      mockRepository.getChecklists.mockResolvedValue(checklists);
      mockRepository.createReviewDocumentCache.mockResolvedValue({
        id: 1,
        reviewHistoryId,
        fileName: 'document.txt',
        processMode: 'text',
        textContent: 'テストファイルの内容',
        imageData: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      // AIがID 1のみ返す（ID 2, 3は未分類→「その他」カテゴリに追加される）
      mockClassifyCategoryAgent.generateLegacy.mockResolvedValue({
        object: {
          categories: [{ name: 'セキュリティ', checklistIds: [1] }],
        },
        finishReason: 'stop',
      });

      // レビューエージェントのモック（各カテゴリごとに呼ばれる、全IDに対して応答）
      mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
        object: [
          {
            checklistId: 1,
            reviewSections: [],
            comment: 'コメント1',
            evaluation: 'A',
          },
          {
            checklistId: 2,
            reviewSections: [],
            comment: 'コメント2',
            evaluation: 'B',
          },
          {
            checklistId: 3,
            reviewSections: [],
            comment: 'コメント3',
            evaluation: 'A',
          },
        ],
        finishReason: 'stop',
      });

      // Act
      const run = await executeReviewWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentMode: 'small',
          concurrentChecklistCount: 2,
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      expect(checkResult.status).toBe('success');
      // AIが全IDを返さなくてもレビューが実行されること
      expect(mockReviewExecuteAgent.generateLegacy).toHaveBeenCalled();
    });

    it('空のimageDataでもエラーにならないこと', async () => {
      // Arrange
      const reviewHistoryId = 'review-1';
      const files: UploadFile[] = [
        {
          id: 'file-1',
          name: 'empty.pdf',
          path: '/test/empty.pdf',
          type: 'application/pdf',
          processMode: 'image',
          imageMode: 'pages',
          imageData: [],
        },
      ];
      const checklists: ReviewChecklist[] = [
        {
          id: 1,
          content: 'チェック項目1',
          createdBy: 'user',
          reviewHistoryId,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      mockRepository.getChecklists.mockResolvedValue(checklists);
      mockRepository.createReviewDocumentCache.mockResolvedValue({
        id: 1,
        reviewHistoryId,
        fileName: 'empty.pdf',
        processMode: 'image',
        textContent: undefined,
        imageData: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
        object: [
          {
            checklistId: 1,
            reviewSections: [],
            comment: 'コメント',
            evaluation: 'A',
          },
        ],
        finishReason: 'stop',
      });

      // Act
      const run = await executeReviewWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentMode: 'small',
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      expect(checkResult.status).toBe('success');
    });

    it('空のtextContentでもエラーにならないこと', async () => {
      // Arrange
      const reviewHistoryId = 'review-1';
      const files: UploadFile[] = [
        {
          id: 'file-1',
          name: 'empty.txt',
          path: '/test/empty.txt',
          type: 'text/plain',
          processMode: 'text',
        },
      ];
      const checklists: ReviewChecklist[] = [
        {
          id: 1,
          content: 'チェック項目1',
          createdBy: 'user',
          reviewHistoryId,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      mockExtract.mockResolvedValue({
        content: '',
        images: [],
        strategyUsed: 'txt-default',
        formatType: 'txt-plain',
      });

      mockRepository.getChecklists.mockResolvedValue(checklists);
      mockRepository.createReviewDocumentCache.mockResolvedValue({
        id: 1,
        reviewHistoryId,
        fileName: 'empty.txt',
        processMode: 'text',
        textContent: '',
        imageData: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
        object: [
          {
            checklistId: 1,
            reviewSections: [],
            comment: 'コメント',
            evaluation: 'A',
          },
        ],
        finishReason: 'stop',
      });

      // Act
      const run = await executeReviewWorkflow.createRunAsync();
      const result = await run.start({
        inputData: {
          reviewHistoryId,
          files,
          documentMode: 'small',
        },
      });

      // Assert
      const checkResult = checkWorkflowResult(result);
      expect(checkResult.status).toBe('success');
    });
  });

  describe('自動判定モード（auto）', () => {
    describe('正常系', () => {
      it('試行レビューが成功した場合、smallモードでレビューが実行されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 自動判定の試行レビュー（1回目）と本番レビュー（2回目以降）両方成功
        mockReviewExecuteAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: 'コメント1',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'auto',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // smallモードとしてDBに保存されること
        expect(
          mockRepository.updateReviewHistoryDocumentMode,
        ).toHaveBeenCalledWith(reviewHistoryId, 'small');

        // reviewExecuteAgentが呼ばれること（試行 + 本番レビュー）
        expect(mockReviewExecuteAgent.generateLegacy).toHaveBeenCalled();

        // upsertReviewResultが呼ばれること（本番レビューの結果保存）
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
      });

      it('試行レビューがコンテキスト長超過エラーの場合、largeモードでレビューが実行されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 自動判定の試行レビューでコンテキスト長超過エラーを返す
        let isFirstCall = true;
        mockReviewExecuteAgent.generateLegacy.mockImplementation(async () => {
          if (isFirstCall) {
            isFirstCall = false;
            throw new APICallError({
              message: 'Context length exceeded',
              url: 'http://localhost:11434/v1',
              requestBodyValues: {},
              statusCode: 400,
              responseBody: JSON.stringify({
                error: 'maximum context length exceeded',
              }),
              cause: new Error('maximum context length exceeded'),
              isRetryable: false,
            });
          }
          // 本番（largeモード）では呼ばれない想定
          return {
            object: [],
            finishReason: 'stop',
          };
        });

        // largeモード用のモック
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') || [];
            return {
              object: checklistItems.map((item: any) => ({
                reviewSections: [],
                checklistId: item.id,
                comment: `個別コメント${item.id}`,
              })),
              finishReason: 'stop',
            };
          },
        );

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            { checklistId: 1, comment: '統合コメント1', evaluation: 'A' },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'auto',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // largeモードとしてDBに保存されること
        expect(
          mockRepository.updateReviewHistoryDocumentMode,
        ).toHaveBeenCalledWith(reviewHistoryId, 'large');

        // largeモード用のエージェントが呼ばれること
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalled();
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();
      });

      it('最もチェックリスト文字数が多いカテゴリが試行対象として選ばれること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        // MAX_CHECKLISTS_PER_CATEGORY = 1 なので、各チェックリストが個別カテゴリになる
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: '短い項目', // 4文字
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content:
              'これは非常に長いチェックリスト項目です。文字数が最大のカテゴリとして選ばれるべきです。', // 最長
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 3,
            content: '中程度の項目です', // 中間
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 自動判定の試行レビュー呼び出しを記録
        const trialCallChecklistItems: any[] = [];
        let callCount = 0;
        mockReviewExecuteAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            callCount++;
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') ?? [];
            if (callCount === 1) {
              // 最初の呼び出しが自動判定の試行
              trialCallChecklistItems.push(...checklistItems);
            }
            return {
              object: checklistItems.map((item: any) => ({
                checklistId: item.id,
                reviewSections: [],
                comment: `コメント${item.id}`,
                evaluation: 'A',
              })),
              finishReason: 'stop',
            };
          },
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'auto',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 試行レビューに最大文字数のチェックリスト（ID=2）が使われること
        expect(trialCallChecklistItems).toHaveLength(1);
        expect(trialCallChecklistItems[0].id).toBe(2);
      });
    });

    describe('異常系', () => {
      it('試行レビューでコンテキスト長以外のエラーが発生した場合、ワークフローが失敗すること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 自動判定の試行レビューでコンテキスト長以外のエラー
        mockReviewExecuteAgent.generateLegacy.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'AI APIサーバーエラー' },
          }),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'auto',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toBeDefined();
      });
    });
  });

  describe('mapブロックのエラーハンドリング', () => {
    describe('レビューデータ準備処理（.parallel後の.map）', () => {
      it('deleteReviewDocumentCachesがエラーをthrowした場合にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);

        // DB操作でエラーをthrow
        mockRepository.deleteReviewDocumentCaches.mockRejectedValue(
          new Error('DB接続エラー'),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
      });
    });

    describe('大量ドキュメントレビューの個別レビュー結果保存（.map）', () => {
      it('createReviewLargedocumentResultCacheがエラーをthrowした場合にworkflowがfailedになること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 個別ドキュメントレビューは成功
        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '個別コメント',
            },
          ],
          finishReason: 'stop',
        });

        // DB保存でエラーをthrow
        mockRepository.createReviewLargedocumentResultCache.mockRejectedValue(
          new Error('DB保存エラー'),
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
      });
    });
  });

  describe('checklistId重複排除', () => {
    describe('少量ドキュメントモード', () => {
      it('AI応答にchecklistId重複がある場合、重複排除されてDB保存されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // AI応答にchecklistIdの重複を含む（カテゴリのチェックリストに対して重複を返す）
        mockReviewExecuteAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') || [];
            // 対象チェックリストの結果に重複を含めて返す
            const results = checklistItems.flatMap((item: any) => [
              {
                checklistId: item.id,
                reviewSections: [],
                comment: `最初のコメント${item.id}`,
                evaluation: 'A',
              },
              {
                checklistId: item.id,
                reviewSections: [],
                comment: `重複コメント${item.id}`,
                evaluation: 'B',
              },
            ]);
            return {
              object: results,
              finishReason: 'stop',
            };
          },
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // upsertReviewResultに渡されたデータの重複確認
        const upsertCalls = mockRepository.upsertReviewResult.mock.calls;
        // 各呼び出し（カテゴリごと）でchecklistIdの重複がないこと
        for (const call of upsertCalls) {
          const callChecklistIds = call[0].map((r: any) => r.reviewChecklistId);
          const uniqueIds = new Set(callChecklistIds);
          expect(callChecklistIds.length).toBe(uniqueIds.size);
        }
        // 最初のコメントが保持されていること（重複コメントではなく）
        const allSavedResults = upsertCalls.flatMap((call) => call[0]);
        const result1 = allSavedResults.find(
          (r: any) => r.reviewChecklistId === 1,
        );
        expect(result1).toBeDefined();
        expect(result1!.comment).toBe('最初のコメント1');
      });

      it('リトライ間でchecklistIdが重複する場合、既に保存済みのchecklistIdはスキップされること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document.txt',
            path: '/test/document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // concurrentChecklistCount=2にして両チェックリストを同一カテゴリに配置
        // → 同一のリトライループ内で重複排除が検証可能になる
        mockClassifyCategoryAgent.generateLegacy.mockResolvedValue({
          object: {
            categories: [{ name: 'テストカテゴリ', checklistIds: [1, 2] }],
          },
          finishReason: 'stop',
        });

        // 1回目: checklistId=1のみ返す（checklistId=2が欠落 → リトライ発生）
        // 2回目: checklistId=1（重複）とchecklistId=2を返す
        let callCount = 0;
        mockReviewExecuteAgent.generateLegacy.mockImplementation(async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              object: [
                {
                  checklistId: 1,
                  reviewSections: [],
                  comment: '1回目のコメント1',
                  evaluation: 'A',
                },
              ],
              finishReason: 'stop',
            };
          }
          // 2回目以降: 前回保存済みのchecklistId=1を含む（重複）＋ 新規のchecklistId=2
          return {
            object: [
              {
                checklistId: 1,
                reviewSections: [],
                comment: '2回目のコメント1（重複）',
                evaluation: 'B',
              },
              {
                checklistId: 2,
                reviewSections: [],
                comment: '2回目のコメント2',
                evaluation: 'A',
              },
            ],
            finishReason: 'stop',
          };
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'small',
            concurrentChecklistCount: 2,
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // upsertReviewResultの全呼び出しを検証
        const upsertCalls = mockRepository.upsertReviewResult.mock.calls;
        const allSavedResults = upsertCalls.flatMap((call) => call[0]);

        // checklistId=1は1回のみDB保存されること（2回目の重複分はスキップ）
        const savedForId1 = allSavedResults.filter(
          (r: any) => r.reviewChecklistId === 1,
        );
        expect(savedForId1).toHaveLength(1);
        expect(savedForId1[0].comment).toBe('1回目のコメント1');

        // checklistId=2は2回目で正常に保存されること
        const savedForId2 = allSavedResults.filter(
          (r: any) => r.reviewChecklistId === 2,
        );
        expect(savedForId2).toHaveLength(1);
        expect(savedForId2[0].comment).toBe('2回目のコメント2');

        // AIは2回呼び出されること（リトライが発生）
        expect(mockReviewExecuteAgent.generateLegacy).toHaveBeenCalledTimes(2);
      });
    });

    describe('大量ドキュメントモード - 個別レビュー', () => {
      it('AI応答にchecklistId重複がある場合、統合ステップに重複なし結果が渡ること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document1.txt',
            path: '/test/document1.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document1.txt',
          processMode: 'text',
          textContent: 'ファイル1の内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 個別レビューAIが重複checklistIdを返す（カテゴリのチェックリストに対して重複）
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') || [];
            // 対象チェックリストの結果に重複を含めて返す
            const results = checklistItems.flatMap((item: any) => [
              {
                reviewSections: [],
                checklistId: item.id,
                comment: `最初のコメント${item.id}`,
              },
              {
                reviewSections: [],
                checklistId: item.id,
                comment: `重複コメント${item.id}`,
              },
            ]);
            return {
              object: results,
              finishReason: 'stop',
            };
          },
        );

        // 統合レビュー
        mockConsolidateReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') || [];
            return {
              object: checklistItems.map((item: any) => ({
                checklistId: item.id,
                comment: `統合コメント${item.id}`,
                evaluation: 'A',
              })),
              finishReason: 'stop',
            };
          },
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // 個別レビュー結果キャッシュに保存されたデータの重複確認
        const cacheCalls =
          mockRepository.createReviewLargedocumentResultCache.mock.calls;
        const cachedChecklistIds = cacheCalls.map(
          (call: any) => call[0].reviewChecklistId,
        );
        // 各checklistIdがドキュメント数分のみキャッシュされていること（重複なし）
        // 1ファイル × カテゴリ内チェックリスト = checklistIdあたり1回
        expect(cachedChecklistIds.filter((id: number) => id === 1).length).toBe(
          1,
        );
        // checklistId=2も同様に1回のみキャッシュされていること
        expect(cachedChecklistIds.filter((id: number) => id === 2).length).toBe(
          1,
        );
      });
    });

    describe('大量ドキュメントモード - 統合レビュー', () => {
      it('AI応答にchecklistId重複がある場合、重複排除されてDB保存されること', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'document1.txt',
            path: '/test/document1.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
          {
            id: 2,
            content: 'チェック項目2',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'document1.txt',
          processMode: 'text',
          textContent: 'ファイル1の内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // 個別レビューは正常（重複なし）
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') || [];
            return {
              object: checklistItems.map((item: any) => ({
                reviewSections: [],
                checklistId: item.id,
                comment: `個別コメント${item.id}`,
              })),
              finishReason: 'stop',
            };
          },
        );

        // 統合レビューAIが重複checklistIdを返す（カテゴリのチェックリストに対して重複）
        mockConsolidateReviewAgent.generateLegacy.mockImplementation(
          async (_message: any, options: any) => {
            const checklistItems =
              options?.runtimeContext?.get('checklistItems') || [];
            // 対象チェックリストの結果に重複を含めて返す
            const results = checklistItems.flatMap((item: any) => [
              {
                checklistId: item.id,
                comment: `最初の統合コメント${item.id}`,
                evaluation: 'A',
              },
              {
                checklistId: item.id,
                comment: `重複統合コメント${item.id}`,
                evaluation: 'B',
              },
            ]);
            return {
              object: results,
              finishReason: 'stop',
            };
          },
        );

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');

        // upsertReviewResultに渡されたデータの重複確認
        const upsertCalls = mockRepository.upsertReviewResult.mock.calls;
        // 各呼び出し（カテゴリごと）でchecklistIdの重複がないこと
        for (const call of upsertCalls) {
          const callChecklistIds = call[0].map((r: any) => r.reviewChecklistId);
          const uniqueIds = new Set(callChecklistIds);
          expect(callChecklistIds.length).toBe(uniqueIds.size);
        }
        // 最初のコメントが保持されていること（重複コメントではなく）
        const allSavedResults = upsertCalls.flatMap((call) => call[0]);
        const result1 = allSavedResults.find(
          (r: any) => r.reviewChecklistId === 1,
        );
        expect(result1).toBeDefined();
        expect(result1!.comment).toBe('最初の統合コメント1');
      });
    });
  });

  describe('事前トークンチェック・事前分割（PBI #1, #2）', () => {
    describe('事前トークンチェック（PBI #2: foreach前の早期終了）', () => {
      it('ドキュメントのトークン数がモデルの処理可能上限を超えている場合、AI実行なしに即時終了する', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        // テストモデル(test-model)のデフォルトコンテキスト長: 128,000
        // 最大許容トークン数: 128,000 * 6 * 0.9 = 691,200
        // この上限を超えるテキストを生成（概ね8文字/トークンとして約5,530,000文字必要）
        // 実際には 'a' 1文字 ≒ 0.125トークン(8文字で1トークン)なので、700,000トークン分 ≒ 5,600,000文字
        const maxContextLength = DEFAULT_MAX_CONTEXT_LENGTH; // 128,000
        const maxAllowable = Math.floor(maxContextLength * 6 * 0.9); // 691,200
        // トークナイザで実際に必要な文字数を計算
        const tokenizer = getTokenizer();
        // 大きなテキストを作成（日本語の方がトークン効率が低いので使いやすい）
        // 日本語は概ね1文字≒2-3トークンなので、691,200 / 2 ≒ 350,000文字で超過
        let largeText = '';
        const targetTokens = maxAllowable + 1000; // 少し余分に
        // 効率的に大きなテキストを作成
        const segment = 'テストデータ確認用の文章です。';
        const segmentTokens = tokenizer.countTokens(segment);
        const repeatCount = Math.ceil(targetTokens / segmentTokens) + 1;
        largeText = segment.repeat(repeatCount);

        // 実際にトークン上限を超えていることを確認
        const actualTokens = tokenizer.countTokens(largeText);
        expect(actualTokens).toBeGreaterThan(maxAllowable);

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'very-large-document.txt',
            path: '/test/very-large-document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'very-large-document.txt',
          processMode: 'text',
          textContent: largeText,
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // テキスト抽出モックを大きなテキストに設定
        mockExtract.mockResolvedValue({
          content: largeText,
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'txt-plain',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('トークン数');
        expect(checkResult.errorMessage).toContain('レビュー可能なトークン数');
        // AI実行（individualDocumentReviewAgent）が呼ばれていないことを確認
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        // 統合レビューも呼ばれていないことを確認
        expect(
          mockConsolidateReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        // 全チェックリストにエラーが保存されていること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('レビュー可能なトークン数'),
            }),
          ]),
        );
      });
    });

    describe('事前分割（PBI #2: トークン数に基づく事前分割）', () => {
      it('ドキュメントのトークン数がコンテキスト長を超える場合、事前に分割されてレビューされる', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const maxContextLength = DEFAULT_MAX_CONTEXT_LENGTH; // 128,000

        // コンテキスト長の利用可能トークン数（チェックリスト分とマージンを引いた値）を超えるテキストを作成
        // availableTokens = 128,000 - checklistTokens - (128,000 * 0.2)
        // チェックリストが小さいので概ね 128,000 * 0.8 ≒ 102,400
        // ただし分割上限(691,200)は超えない程度
        const tokenizer = getTokenizer();
        const segment = 'テスト文章の内容を確認します。';
        const segmentTokens = tokenizer.countTokens(segment);
        // 150,000トークン程度のテキストを作成（コンテキスト長の128,000を超えるが、分割上限は超えない）
        const targetTokens = 150_000;
        const repeatCount = Math.ceil(targetTokens / segmentTokens) + 1;
        const mediumText = segment.repeat(repeatCount);

        const actualTokens = tokenizer.countTokens(mediumText);
        expect(actualTokens).toBeGreaterThan(maxContextLength * 0.8); // 利用可能トークン数を超える
        expect(actualTokens).toBeLessThan(maxContextLength * 6 * 0.9); // 分割上限は超えない

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'medium-document.txt',
            path: '/test/medium-document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'medium-document.txt',
            processMode: 'text',
            textContent: mediumText,
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        mockExtract.mockResolvedValue({
          content: mediumText,
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'txt-plain',
        });

        // 個別レビューが成功するようモック設定
        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              comment: 'レビューコメント',
            },
          ],
          finishReason: 'stop',
        });

        // 統合レビューも成功するようモック設定
        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '統合コメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 事前分割数を計算して具体的な回数を検証
        const checklistText = checklists.map((c) => c.content).join('\n');
        const checklistTokens = tokenizer.countTokens(checklistText);
        const availableTokens =
          maxContextLength -
          checklistTokens -
          Math.floor(maxContextLength * 0.2);
        const expectedSplitCount = Math.ceil(actualTokens / availableTokens);
        expect(expectedSplitCount).toBeGreaterThan(1);
        // 個別レビューが事前分割数と同じ回数呼ばれていること
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(expectedSplitCount);
        // 統合レビューも呼ばれていること
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();
      });
    });

    describe('事前画像数チェック（PBI #2: 画像変換モードの早期終了）', () => {
      it('画像変換モードで画像数がモデルの処理可能上限を超えている場合、AI実行なしに即時終了する', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        // テストモデル(test-model)のデフォルト最大画像数: 20
        // 最大許容画像数: 20 * 6 = 120
        const maxImageCount = DEFAULT_MAX_IMAGE_COUNT; // 20
        const maxAllowableImages = maxImageCount * 6; // 120
        // 上限を超える画像データを作成
        const oversizedImageData = Array.from(
          { length: maxAllowableImages + 10 },
          (_, i) => `base64-image-data-${i}`,
        );

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'large-image-document.pdf',
            path: '/test/large-image-document.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'pages',
            imageData: oversizedImageData,
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'large-image-document.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: oversizedImageData,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        // テキスト抽出モック（画像モードではテキスト抽出は行われないが、ワークフロー内のテキスト抽出ステップ用）
        mockExtract.mockResolvedValue({
          content: '',
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'image-pages',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('画像数');
        expect(checkResult.errorMessage).toContain('レビュー可能な画像数');
        // AI実行が呼ばれていないことを確認
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        // 統合レビューも呼ばれていないことを確認
        expect(
          mockConsolidateReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        // 全チェックリストにエラーが保存されていること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('画像数'),
            }),
          ]),
        );
      });
    });

    describe('事前画像数チェック（PBI #2: テキスト+リッチ戦略+画像含むの早期終了）', () => {
      it('抽出画像数がモデルの処理可能上限を超えている場合、AI実行なしに即時終了する', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const maxImageCount = DEFAULT_MAX_IMAGE_COUNT; // 20
        const maxAllowableImages = maxImageCount * 6; // 120
        // 上限を超える抽出画像を作成
        const oversizedExtractedImages = Array.from(
          { length: maxAllowableImages + 10 },
          (_, i) => ({
            referenceId: `image_${i}.png`,
            base64Data: `data:image/png;base64,test-${i}`,
            mimeType: 'image/png',
          }),
        );

        // テキスト中に画像リンクを埋め込む
        const textWithImages = oversizedExtractedImages
          .map((img) => `テスト文章 ![画像](${img.referenceId})`)
          .join('\n');

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'rich-document.docx',
            path: '/test/rich-document.docx',
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            processMode: 'text',
            includeImages: true,
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'rich-document.docx',
          processMode: 'text',
          textContent: textWithImages,
          imageData: undefined,
          extractedImages: oversizedExtractedImages,
          formatType: 'docx-rich-v1',
          includeImages: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockExtract.mockResolvedValue({
          content: textWithImages,
          images: oversizedExtractedImages,
          strategyUsed: 'docx-mammoth-rich',
          formatType: 'docx-rich-v1',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('抽出画像数');
        expect(checkResult.errorMessage).toContain('レビュー可能な画像数');
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        // 統合レビューも呼ばれていないことを確認
        expect(
          mockConsolidateReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('抽出画像数'),
            }),
          ]),
        );
      });
    });

    describe('事前分割（PBI #2: 画像変換モードの事前分割）', () => {
      it('画像変換モードで画像数が最大画像数を超える場合、事前に分割されてレビューされる', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const maxImageCount = DEFAULT_MAX_IMAGE_COUNT; // 20
        // 最大画像数を少し超える画像（30枚）→ 2分割される
        const imageCount = 30;
        const imageData = Array.from(
          { length: imageCount },
          (_, i) => `base64-image-data-${i}`,
        );

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'medium-image-document.pdf',
            path: '/test/medium-image-document.pdf',
            type: 'application/pdf',
            processMode: 'image',
            imageMode: 'pages',
            imageData,
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'medium-image-document.pdf',
            processMode: 'image',
            textContent: undefined,
            imageData,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        mockExtract.mockResolvedValue({
          content: '',
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'image-pages',
        });

        // 個別レビューが成功するようモック設定
        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              comment: 'レビューコメント',
            },
          ],
          finishReason: 'stop',
        });

        // 統合レビューも成功するようモック設定
        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '統合コメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 30枚 / 20枚(最大) = ceil(1.5) = 2分割
        const expectedSplitCount = Math.ceil(imageCount / maxImageCount);
        expect(expectedSplitCount).toBe(2);
        // 個別レビューが事前分割数と同じ回数呼ばれていること
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(expectedSplitCount);
        // 統合レビューも呼ばれていること
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();
      });
    });

    describe('事前分割（PBI #2: テキスト+リッチ戦略+画像含むの事前分割）', () => {
      it('抽出画像数がトークン数より先に上限に達する場合、画像数ベースで分割される', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const maxImageCount = DEFAULT_MAX_IMAGE_COUNT; // 20
        // 画像数が最大画像数を超えるが、分割上限内（例: 30枚 → 2分割で収まる）
        const imageCount = 30;
        // テキストは短い（トークン数ベースでは分割不要）が、画像が多い
        const extractedImages = Array.from({ length: imageCount }, (_, i) => ({
          referenceId: `image_${i}.png`,
          base64Data: `data:image/png;base64,test-${i}`,
          mimeType: 'image/png',
        }));
        // テキスト中に画像リンクを均等に埋め込む
        const textWithImages = extractedImages
          .map((img) => `テスト文章 ![画像](${img.referenceId})`)
          .join('\n');

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'rich-document-with-images.docx',
            path: '/test/rich-document-with-images.docx',
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            processMode: 'text',
            includeImages: true,
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'rich-document-with-images.docx',
            processMode: 'text',
            textContent: textWithImages,
            imageData: undefined,
            extractedImages,
            formatType: 'docx-rich-v1',
            includeImages: true,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        mockExtract.mockResolvedValue({
          content: textWithImages,
          images: extractedImages,
          strategyUsed: 'docx-mammoth-rich',
          formatType: 'docx-rich-v1',
        });

        // 個別レビューが成功するようモック設定
        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              comment: 'レビューコメント',
            },
          ],
          finishReason: 'stop',
        });

        // 統合レビューも成功するようモック設定
        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '統合コメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 30枚 / 20枚(最大) → 少なくとも2分割以上
        const callCount =
          mockIndividualDocumentReviewAgent.generateLegacy.mock.calls.length;
        expect(callCount).toBeGreaterThanOrEqual(2);
        // 統合レビューも呼ばれていること
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();
      });
    });

    describe('トークン数が範囲内の場合（分割不要）', () => {
      it('ドキュメントのトークン数がコンテキスト長以内であれば分割なしでレビューされる', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const smallText = 'これは短いテスト文書です。'; // 数十トークン程度

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'small-document.txt',
            path: '/test/small-document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'small-document.txt',
            processMode: 'text',
            textContent: smallText,
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        mockExtract.mockResolvedValue({
          content: smallText,
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'txt-plain',
        });

        // 個別レビューが成功するようモック設定
        mockIndividualDocumentReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              comment: 'レビューコメント',
            },
          ],
          finishReason: 'stop',
        });

        // 統合レビューも成功するようモック設定
        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '統合コメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 個別レビューが1回だけ呼ばれていること（分割されていない）
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(1);
        // 個別レビューに渡されたドキュメントが分割されていない（ドキュメント名に "split into parts" が含まれない）ことを検証
        const firstCallArgs =
          mockIndividualDocumentReviewAgent.generateLegacy.mock.calls[0];
        const messageContent = firstCallArgs[0].content;
        const allText = messageContent
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
        expect(allText).not.toContain('split into parts');
      });
    });

    describe('B-2早期終了（分割後画像数超過）', () => {
      it('テキスト+リッチ+画像で、B-1は通過するがMAX_SPLIT_COUNT分割後も1チャンクあたり画像数が超過する場合、即時終了する', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const maxImageCount = DEFAULT_MAX_IMAGE_COUNT; // 20
        const maxAllowableImages = maxImageCount * 6; // 120

        // B-1（全体画像数チェック）は通過するが、B-2（分割後チャンクチェック）で引っかかるケース
        // 画像数はmaxAllowableImages以内だが、画像が偏在しておりMAX_SPLIT_COUNT分割でも1チャンクに集中する
        // 例: 100枚の画像をテキストの先頭に集中配置
        const imageCount = 100; // < 120 なのでB-1は通過
        const extractedImages = Array.from({ length: imageCount }, (_, i) => ({
          referenceId: `image_${i}.png`,
          base64Data: `data:image/png;base64,test-${i}`,
          mimeType: 'image/png',
        }));

        // 全画像リンクをテキストの先頭に集中配置（パディングで後半を埋める）
        const imageLinks = extractedImages
          .map((img) => `![画像](${img.referenceId})`)
          .join('\n');
        const padding = 'パディングテキスト。'.repeat(500);
        const textWithImages = imageLinks + '\n' + padding;

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'rich-doc-concentrated-images.docx',
            path: '/test/rich-doc-concentrated-images.docx',
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            processMode: 'text',
            includeImages: true,
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockRepository.createReviewDocumentCache.mockResolvedValue({
          id: 1,
          reviewHistoryId,
          fileName: 'rich-doc-concentrated-images.docx',
          processMode: 'text',
          textContent: textWithImages,
          imageData: undefined,
          extractedImages,
          formatType: 'docx-rich-v1',
          includeImages: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        });

        mockExtract.mockResolvedValue({
          content: textWithImages,
          images: extractedImages,
          strategyUsed: 'docx-mammoth-rich',
          formatType: 'docx-rich-v1',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain(
          '1チャンクあたりの画像数がモデルの上限',
        );
        // AI実行が呼ばれていないことを確認
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        expect(
          mockConsolidateReviewAgent.generateLegacy,
        ).not.toHaveBeenCalled();
        // 全チェックリストにエラーが保存されていること
        expect(mockRepository.upsertReviewErrors).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              reviewChecklistId: 1,
              errorMessage: expect.stringContaining('1チャンクあたりの画像数'),
            }),
          ]),
        );
      });
    });

    describe('事前分割後のリトライ（retryCount検証）', () => {
      it('事前分割されたドキュメントがcontent_lengthエラーになった場合、preSplitCountより多い分割数でリトライされる', async () => {
        // Arrange
        const reviewHistoryId = 'review-1';
        const maxContextLength = DEFAULT_MAX_CONTEXT_LENGTH; // 128,000
        const tokenizer = getTokenizer();

        // 利用可能トークン数を超えるテキストを作成（2分割必要）
        const segment = 'テスト文章の内容を確認します。';
        const segmentTokens = tokenizer.countTokens(segment);
        const targetTokens = 150_000; // → 事前に2分割される
        const repeatCount = Math.ceil(targetTokens / segmentTokens) + 1;
        const mediumText = segment.repeat(repeatCount);

        const actualTokens = tokenizer.countTokens(mediumText);
        const availableTokens = maxContextLength - maxContextLength * 0.2;
        // 事前分割数を計算（テストの前提確認）
        const expectedPreSplitCount = Math.ceil(actualTokens / availableTokens);
        expect(expectedPreSplitCount).toBe(2); // 2分割される想定

        const files: UploadFile[] = [
          {
            id: 'file-1',
            name: 'medium-document.txt',
            path: '/test/medium-document.txt',
            type: 'text/plain',
            processMode: 'text',
          },
        ];
        const checklists: ReviewChecklist[] = [
          {
            id: 1,
            content: 'チェック項目1',
            createdBy: 'user',
            reviewHistoryId,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(
          async () => ({
            id: cacheIdCounter++,
            reviewHistoryId,
            fileName: 'medium-document.txt',
            processMode: 'text',
            textContent: mediumText,
            imageData: undefined,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          }),
        );

        mockExtract.mockResolvedValue({
          content: mediumText,
          images: [],
          strategyUsed: 'txt-default',
          formatType: 'txt-plain',
        });

        // 事前分割で2分割 → 1回目の個別レビュー(2回呼ばれる)ではcontent_lengthエラー
        // → リトライで3分割(3回呼ばれる)で成功
        let callCount = 0;
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(
          async (message: any) => {
            callCount++;
            if (callCount <= 2) {
              // 事前分割後の最初のレビュー（2チャンク）でcontent_lengthエラー
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
            // 3分割後のレビューは成功
            const textContent =
              message.content.find((c: any) => c.type === 'text')?.text || '';
            const partMatch = textContent.match(/part (\d+)/);
            const documentId = partMatch ? `1_part${partMatch[1]}` : '1';

            return {
              object: [
                {
                  checklistId: 1,
                  comment: 'リトライ後コメント',
                  documentId,
                },
              ],
              finishReason: 'stop',
            };
          },
        );

        mockConsolidateReviewAgent.generateLegacy.mockResolvedValue({
          object: [
            {
              checklistId: 1,
              reviewSections: [],
              comment: '統合コメント',
              evaluation: 'A',
            },
          ],
          finishReason: 'stop',
        });

        // Act
        const run = await executeReviewWorkflow.createRunAsync();
        const result = await run.start({
          inputData: {
            reviewHistoryId,
            files,
            documentMode: 'large',
          },
        });

        // Assert
        const checkResult = checkWorkflowResult(result);
        expect(checkResult.status).toBe('success');
        // 事前分割(2チャンク) + リトライ(3チャンク) = 5回呼ばれる
        expect(
          mockIndividualDocumentReviewAgent.generateLegacy,
        ).toHaveBeenCalledTimes(5);
        // 統合レビューも呼ばれること
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();
      });
    });
  });
});
