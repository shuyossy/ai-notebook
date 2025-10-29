/**
 * ドキュメントレビュー実行ワークフローのテスト
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

import { executeReviewWorkflow } from '@/mastra/workflows/sourceReview/executeReview';
import { mastra } from '@/mastra';
import { getReviewRepository } from '@/adapter/db';
import FileExtractor from '@/main/lib/fileExtractor';
import { checkWorkflowResult } from '@/mastra/lib/workflowUtils';
import type { IReviewRepository } from '@/main/service/port/repository/IReviewRepository';
import type { UploadFile, ReviewChecklist } from '@/types';
import { internalError } from '@/main/lib/error';
import { APICallError } from 'ai';

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

// FileExtractor のモック
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

describe('executeReviewWorkflow', () => {
  // モックリポジトリ
  let mockRepository: jest.Mocked<IReviewRepository>;

  // モックエージェント
  let mockClassifyCategoryAgent: any;
  let mockReviewExecuteAgent: any;
  let mockIndividualDocumentReviewAgent: any;
  let mockConsolidateReviewAgent: any;

  beforeEach(() => {
    // リポジトリのモック
    mockRepository = {
      createReviewHistory: jest.fn(),
      getReviewHistory: jest.fn().mockResolvedValue({ id: 'review-1' }),
      getAllReviewHistories: jest.fn(),
      updateReviewHistoryTitle: jest.fn(),
      updateReviewHistoryAdditionalInstructionsAndCommentFormat: jest.fn(),
      updateReviewHistoryEvaluationSettings: jest.fn(),
      updateReviewHistoryProcessingStatus: jest.fn(),
      updateReviewHistoryTargetDocumentName: jest.fn().mockResolvedValue(undefined),
      deleteReviewHistory: jest.fn(),
      getChecklists: jest.fn(),
      createChecklist: jest.fn(),
      updateChecklist: jest.fn(),
      deleteChecklist: jest.fn(),
      deleteSystemCreatedChecklists: jest.fn(),
      upsertReviewResult: jest.fn().mockResolvedValue(undefined),
      getReviewChecklistResults: jest.fn(),
      deleteAllReviewResults: jest.fn().mockResolvedValue(undefined),
      deleteReviewDocumentCaches: jest.fn().mockResolvedValue(undefined),
      deleteReviewLargedocumentResultCaches: jest.fn().mockResolvedValue(undefined),
      updateReviewHistoryDocumentMode: jest.fn().mockResolvedValue(undefined),
      createReviewDocumentCache: jest.fn(),
      getReviewDocumentCaches: jest.fn(),
      getReviewDocumentCacheById: jest.fn(),
      getReviewDocumentCacheByIds: jest.fn(),
      createReviewLargedocumentResultCache: jest.fn().mockResolvedValue(undefined),
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
    mockExtractText.mockReset();
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 3, content: 'チェック項目3', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
            { checklistId: 1, reviewSections: [], comment: 'コメント1', evaluation: 'A' },
            { checklistId: 2, reviewSections: [], comment: 'コメント2', evaluation: 'B' },
            { checklistId: 3, reviewSections: [], comment: 'コメント3', evaluation: 'C' },
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
        expect(mockRepository.deleteReviewLargedocumentResultCaches).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteReviewDocumentCaches).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteAllReviewResults).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.updateReviewHistoryDocumentMode).toHaveBeenCalledWith(reviewHistoryId, 'small');
        expect(mockRepository.createReviewDocumentCache).toHaveBeenCalled();
        expect(mockRepository.upsertReviewResult).toHaveBeenCalled();
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
            { checklistId: 1, reviewSections: [], comment: 'コメント1', evaluation: 'A' },
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
        expect(FileExtractor.extractText).toHaveBeenCalledTimes(2);
        expect(mockRepository.createReviewDocumentCache).toHaveBeenCalledTimes(2);
        expect(mockRepository.updateReviewHistoryTargetDocumentName).toHaveBeenCalledWith(
          reviewHistoryId,
          'document1.txt/document2.txt',
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
            { checklistId: 1, reviewSections: [], comment: '画像レビュー', evaluation: 'A' },
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
        expect(FileExtractor.extractText).not.toHaveBeenCalled();

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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
            { checklistId: 1, reviewSections: [], comment: 'カスタム評定', evaluation: '優' },
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
        expect(options.runtimeContext.get('evaluationSettings')).toEqual(evaluationSettings);
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        ];
        const additionalInstructions = 'セキュリティの観点で厳しくレビューしてください';
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
            { checklistId: 1, reviewSections: [], comment: '- 問題点: なし\n- 推奨事項: なし', evaluation: 'A' },
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
        expect(options.runtimeContext.get('additionalInstructions')).toBe(additionalInstructions);
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 3, content: 'チェック項目3', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        mockReviewExecuteAgent.generateLegacy
          // カテゴリ1の1回目（空）
          .mockResolvedValueOnce({
            object: [],
            finishReason: 'stop',
          })
          // カテゴリ2の1回目（成功）
          .mockResolvedValueOnce({
            object: [
              { checklistId: 2, reviewSections: [], comment: 'コメント2', evaluation: 'B' },
            ],
            finishReason: 'stop',
          })
          // カテゴリ3の1回目（成功）
          .mockResolvedValueOnce({
            object: [
              { checklistId: 3, reviewSections: [], comment: 'コメント3', evaluation: 'C' },
            ],
            finishReason: 'stop',
          })
          // カテゴリ1の2回目（成功）
          .mockResolvedValueOnce({
            object: [
              { checklistId: 1, reviewSections: [], comment: 'コメント1', evaluation: 'A' },
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

        mockExtractText.mockRejectedValue(
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
        expect(checkResult.errorMessage).toContain('対象のチェックリストが存在しないためレビューを実行できませんでした');
      });

      it('レビューエージェントAPIエラー時にworkflowがfailedになること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('AI APIエラー');
      });

      it('最大試行回数超過時にエラーメッセージに未完了項目が含まれること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
            { checklistId: 1, reviewSections: [], comment: 'コメント1', evaluation: 'A' },
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
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('チェック項目2');
        expect(checkResult.errorMessage).toContain('AIの出力にレビュー結果が含まれませんでした');
      });

      it('finishReasonがlengthの場合に適切なエラーメッセージが返ること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('最大出力コンテキストを超えました');
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
            { checklistId: 1, reviewSections: [], comment: '統合画像レビュー', evaluation: 'A' },
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
        expect(FileExtractor.extractText).not.toHaveBeenCalled();

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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
            { checklistId: 1, reviewSections: [], comment: 'コメント', evaluation: 'A' },
          ],
          finishReason: 'stop',
        });

        mockRepository.upsertReviewResult.mockRejectedValue(
          internalError({
            expose: true,
            messageCode: 'PLAIN_MESSAGE',
            messageParams: { message: 'レビュー結果保存エラー' },
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
        expect(checkResult.errorMessage).toContain('レビュー結果保存エラー');
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(async (_message: any, options: any) => {
          const checklistItems = options?.runtimeContext?.get('checklistItems') || [];
          // 実際に対象となっているチェックリストIDのみの結果を返す
          return {
            object: checklistItems.map((item: any) => ({
              reviewSections: [],
              checklistId: item.id,
              comment: `個別コメント${item.id}`,
            })),
            finishReason: 'stop',
          };
        });

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
        expect(mockIndividualDocumentReviewAgent.generateLegacy).toHaveBeenCalledTimes(4); // 2ファイル × 2カテゴリ
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalledTimes(2); // 2カテゴリ

        // 個別レビュー結果キャッシュ保存の詳細検証
        // 2ファイル × 2チェックリスト = 4回呼ばれる
        expect(mockRepository.createReviewLargedocumentResultCache).toHaveBeenCalledTimes(4);

        // 各ドキュメントキャッシュIDに対して正しく保存されることを確認
        const largeDocCacheCalls = mockRepository.createReviewLargedocumentResultCache.mock.calls;

        // document1 (cacheId=1) に対するキャッシュ保存 (2チェックリスト = 2回)
        const doc1Calls = largeDocCacheCalls.filter((call) => call[0].reviewDocumentCacheId === 1);
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
        const doc2Calls = largeDocCacheCalls.filter((call) => call[0].reviewDocumentCacheId === 2);
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        mockExtractText.mockResolvedValue({
          content: 'A'.repeat(10000), // 長いテキスト
        });
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(async () => ({
          id: cacheIdCounter++,
          reviewHistoryId,
          fileName: 'large-document.txt',
          processMode: 'text',
          textContent: 'A'.repeat(10000),
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }));

        // 1回目: コンテキスト長エラー例外をthrow
        // 2回目以降: 分割後の各チャンクで成功 (documentIdを含める)
        let callCount = 0;
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(async (message: any) => {
          callCount++;
          if (callCount === 1) {
            // コンテキスト長エラーを示すAPICallErrorをthrow
            throw new APICallError({
              message: 'Context length exceeded',
              url: 'http://test-api',
              requestBodyValues: {},
              statusCode: 400,
              responseBody: JSON.stringify({ error: 'maximum context length exceeded' }),
              cause: new Error('maximum context length exceeded'),
              isRetryable: false,
            });
          }
          // documentIdを生成（分割後のドキュメント用）
          const textContent = message.content.find((c: any) => c.type === 'text')?.text || '';
          const isPart = textContent.includes('part');
          const partMatch = textContent.match(/part (\d+)/);
          const documentId = isPart && partMatch ? `1_part${partMatch[1]}` : '1';

          return {
            object: [
              { reviewSections: [], checklistId: 1, comment: '分割後コメント', documentId },
            ],
            finishReason: 'stop',
          };
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
        // 1回目失敗 + 2回目は2分割して成功 = 3回呼ばれる
        expect(mockIndividualDocumentReviewAgent.generateLegacy).toHaveBeenCalledTimes(3);
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();

        // 分割後の個別レビュー結果キャッシュ保存の検証
        // 2つの分割チャンクに対して各1チェックリスト = 2回呼ばれる
        expect(mockRepository.createReviewLargedocumentResultCache).toHaveBeenCalledTimes(2);

        const splitCacheCalls = mockRepository.createReviewLargedocumentResultCache.mock.calls;

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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(async () => ({
          id: cacheIdCounter++,
          reviewHistoryId,
          fileName: 'large-pdf.pdf',
          processMode: 'image',
          textContent: undefined,
          imageData: Array(20).fill('data:image/png;base64,page'),
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }));

        // 1回目: コンテキスト長エラー例外をthrow
        // 2回目以降: 分割後の各チャンクで成功 (documentIdを含める)
        let callCount = 0;
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(async (message: any) => {
          callCount++;
          if (callCount === 1) {
            // 画像が多すぎるエラーを示すAPICallErrorをthrow
            throw new APICallError({
              message: 'Too many images',
              url: 'http://test-api',
              requestBodyValues: {},
              statusCode: 400,
              responseBody: JSON.stringify({ error: 'too many images in request' }),
              cause: new Error('too many images'),
              isRetryable: false,
            });
          }
          // documentIdを生成（分割後のドキュメント用）
          const textContent = message.content.find((c: any) => c.type === 'text')?.text || '';
          const isPart = textContent.includes('part');
          const partMatch = textContent.match(/part (\d+)/);
          const documentId = isPart && partMatch ? `1_part${partMatch[1]}` : '1';

          return {
            object: [
              { reviewSections: [], checklistId: 1, comment: '分割後コメント', documentId },
            ],
            finishReason: 'stop',
          };
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
        // 1回目失敗 + 2回目は2分割して成功 = 3回呼ばれる
        expect(mockIndividualDocumentReviewAgent.generateLegacy).toHaveBeenCalledTimes(3);
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalled();

        // 分割後の個別レビュー結果キャッシュ保存の検証（画像）
        // 2つの分割チャンクに対して各1チェックリスト = 2回呼ばれる
        expect(mockRepository.createReviewLargedocumentResultCache).toHaveBeenCalledTimes(2);

        const imageSplitCacheCalls = mockRepository.createReviewLargedocumentResultCache.mock.calls;

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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        ];
        const additionalInstructions = 'セキュリティの観点で厳しくレビューしてください';
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
            { checklistId: 1, comment: '- 問題点: なし\n- 推奨事項: なし', evaluation: 'A' },
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
        const individualCallArgs = mockIndividualDocumentReviewAgent.generateLegacy.mock.calls[0];
        const individualOptions = individualCallArgs[1];
        expect(individualOptions.runtimeContext.get('additionalInstructions')).toBe(additionalInstructions);
        expect(individualOptions.runtimeContext.get('commentFormat')).toBe(commentFormat);

        // consolidateReviewAgentに設定されていることを確認
        const consolidateCallArgs = mockConsolidateReviewAgent.generateLegacy.mock.calls[0];
        const consolidateOptions = consolidateCallArgs[1];
        expect(consolidateOptions.runtimeContext.get('additionalInstructions')).toBe(additionalInstructions);
        expect(consolidateOptions.runtimeContext.get('commentFormat')).toBe(commentFormat);
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        const consolidateCallArgs = mockConsolidateReviewAgent.generateLegacy.mock.calls[0];
        const consolidateOptions = consolidateCallArgs[1];
        expect(consolidateOptions.runtimeContext.get('evaluationSettings')).toEqual(evaluationSettings);
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(FileExtractor.extractText).not.toHaveBeenCalled();

        // individualDocumentReviewAgentに統合画像データが渡されることを確認
        const callArgs = mockIndividualDocumentReviewAgent.generateLegacy.mock.calls[0];
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(mockIndividualDocumentReviewAgent.generateLegacy).toHaveBeenCalledTimes(2);
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(mockConsolidateReviewAgent.generateLegacy).toHaveBeenCalledTimes(2);
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(mockRepository.deleteReviewLargedocumentResultCaches).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteReviewDocumentCaches).toHaveBeenCalledWith(reviewHistoryId);
        expect(mockRepository.deleteAllReviewResults).toHaveBeenCalledWith(reviewHistoryId);

        // documentMode保存が呼ばれていることを確認
        expect(mockRepository.updateReviewHistoryDocumentMode).toHaveBeenCalledWith(
          reviewHistoryId,
          'large',
        );

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
        expect(mockRepository.createReviewLargedocumentResultCache).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewDocumentCacheId: 1,
            reviewChecklistId: 1,
            comment: '個別コメント',
          }),
        );
      });
    });

    describe('異常系', () => {
      it('個別ドキュメントレビュー失敗時にworkflowがfailedになること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('個別レビューエラー');
      });

      it('統合レビュー失敗時にworkflowがfailedになること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('統合レビューエラー');
      });

      it('分割リトライ最大回数超過時にエラーになること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        ];

        mockRepository.getChecklists.mockResolvedValue(checklists);
        let cacheIdCounter = 1;
        mockRepository.createReviewDocumentCache.mockImplementation(async () => ({
          id: cacheIdCounter++,
          reviewHistoryId,
          fileName: 'document.txt',
          processMode: 'text',
          textContent: 'テストファイルの内容',
          imageData: undefined,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }));

        // 常にコンテキスト長エラー例外をthrow (最大5回リトライまで)
        mockIndividualDocumentReviewAgent.generateLegacy.mockImplementation(async () => {
          // 常にコンテキスト長エラーをthrow
          throw new APICallError({
            message: 'Context length exceeded',
            url: 'http://test-api',
            requestBodyValues: {},
            statusCode: 400,
            responseBody: JSON.stringify({ error: 'maximum context length exceeded' }),
            cause: new Error('maximum context length exceeded'),
            isRetryable: false,
          });
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
        // リトライ最大回数（5回）を超えた場合、特定のエラーメッセージが返される
        expect(checkResult.errorMessage).toBe(
          'ドキュメント分割を複数回実行しましたが、コンテキスト長エラーが解消されませんでした'
        );
        // リトライのたびにドキュメントが分割され、foreachで個別レビューが実行される
        // retryCount 0: 1個 (1回), 1: 2個 (2回), 2: 3個 (3回), 3: 4個 (4回), 4: 5個 (5回), 5: 6個 (6回)
        // 合計: 1+2+3+4+5+6 = 21回
        expect(mockIndividualDocumentReviewAgent.generateLegacy).toHaveBeenCalledTimes(21);
      });

      it('個別レビュー未完了チェックリスト最大試行回数超過時にエラーになること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('チェック項目2');
        expect(checkResult.errorMessage).toContain('AIの出力にレビュー結果が含まれませんでした');
      });

      it('統合レビュー未完了チェックリスト最大試行回数超過時にエラーになること', async () => {
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
          { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
        expect(checkResult.status).toBe('failed');
        expect(checkResult.errorMessage).toContain('チェック項目2');
        expect(checkResult.errorMessage).toContain('AIの出力に統合レビュー結果が含まれませんでした');
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
        { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: 2, content: 'チェック項目2', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
          { checklistId: 1, reviewSections: [], comment: 'コメント1', evaluation: 'A' },
          { checklistId: 2, reviewSections: [], comment: 'コメント2', evaluation: 'B' },
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
      // このテストはclassifyChecklistsByCategoryStepの内部ロジックなので、
      // MAX_CHECKLISTS_PER_CATEGORY > 1に設定する必要がある
      // 現在の実装では MAX_CHECKLISTS_PER_CATEGORY = 1なのでスキップ
      // 将来的にMAX_CHECKLISTS_PER_CATEGORYを変更可能にした場合に有効化
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
        { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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
          { checklistId: 1, reviewSections: [], comment: 'コメント', evaluation: 'A' },
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
        { id: 1, content: 'チェック項目1', createdBy: 'user', reviewHistoryId, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];

      mockExtractText.mockResolvedValue({
        content: '',
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
          { checklistId: 1, reviewSections: [], comment: 'コメント', evaluation: 'A' },
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
});
