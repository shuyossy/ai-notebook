/**
 * ReviewService - extractChecklistFromCsv メソッドのテスト
 * @jest-environment node
 */

// Electron モックを最初に適用
jest.mock('electron', () => require('./test-utils/mockElectron').mockElectron);
jest.mock('electron-store', () => require('./test-utils/mockElectron').default);

// main.ts の初期化処理をスキップ
jest.mock('@/main/main', () => {
  const path = require('path');
  const os = require('os');
  const testAppData = path.join(os.tmpdir(), 'ai-notebook-test');
  return {
    getCustomAppDataDir: jest.fn(() => testAppData),
  };
});

import { ReviewService } from '@/main/service/reviewService';
import { getReviewRepository, getSettingsRepository } from '@/adapter/db';
import FileExtractor from '@/main/lib/fileExtractor';
import { IpcChannels } from '@/types';
import type { IReviewRepository, ISettingsRepository } from '@/main/service/port/repository';
import type { UploadFile, Settings } from '@/types';

// モック設定
const mockExtractText = jest.fn();
jest.mock('@/main/lib/fileExtractor', () => ({
  __esModule: true,
  default: {
    get extractText() {
      return mockExtractText;
    },
  },
}));

// イベント発火のモック
const mockPublishEvent = jest.fn();
jest.mock('@/main/lib/eventPayloadHelper', () => ({
  publishEvent: (...args: any[]) => mockPublishEvent(...args),
}));

// リポジトリのモック
const mockGetReviewRepository = jest.fn();
const mockGetSettingsRepository = jest.fn();
jest.mock('@/adapter/db', () => ({
  getReviewRepository: () => mockGetReviewRepository(),
  getSettingsRepository: () => mockGetSettingsRepository(),
  getSourceRepository: jest.fn(() => ({
    getAllSources: jest.fn(),
  })),
  getChatRepository: jest.fn(() => ({
    getChatRooms: jest.fn(),
  })),
}));

describe('ReviewService - extractChecklistFromCsv', () => {
  let reviewService: ReviewService;
  let mockReviewRepository: jest.Mocked<IReviewRepository>;
  let mockSettingsRepository: jest.Mocked<ISettingsRepository>;

  const defaultSettings: Settings = {
    api: { key: 'old-key', url: 'http://old.com', model: 'old-model' },
    database: { dir: '/test/db' },
    source: { registerDir: './source' },
    redmine: { endpoint: '', apiKey: '' },
    gitlab: { endpoint: '', apiKey: '' },
    mcp: { serverConfig: undefined },
    systemPrompt: { content: '' },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // シングルトンをリセット（内部的にインスタンスを破棄）
    (ReviewService as any).instance = undefined;

    // ReviewRepository のモック
    mockReviewRepository = {
      getReviewHistory: jest.fn().mockResolvedValue(null),
      createReviewHistory: jest.fn().mockResolvedValue({
        id: 'review-1',
        title: 'テストレビュー',
        processingStatus: 'idle',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      deleteSystemCreatedChecklists: jest.fn().mockResolvedValue(undefined),
      createChecklist: jest.fn().mockResolvedValue(undefined),
      updateReviewHistoryEvaluationSettings: jest.fn().mockResolvedValue(undefined),
      updateReviewHistoryAdditionalInstructionsAndCommentFormat: jest.fn().mockResolvedValue(undefined),
    } as any;

    // SettingsRepository のモック
    mockSettingsRepository = {
      getSettings: jest.fn().mockResolvedValue(defaultSettings),
      saveSettings: jest.fn().mockResolvedValue(undefined),
    } as any;

    // モック関数を設定
    mockGetReviewRepository.mockReturnValue(mockReviewRepository);
    mockGetSettingsRepository.mockReturnValue(mockSettingsRepository);

    // ReviewService インスタンス作成（シングルトンのgetInstance使用）
    reviewService = ReviewService.getInstance();
  });

  describe('API設定を含むCSVインポート', () => {
    it('API設定を含むCSVインポート時にSETTINGS_UPDATEDイベントが発火すること', async () => {
      // CSVファイルのモック（API設定含む）
      const mockFiles: UploadFile[] = [{
        id: 'file-1',
        name: 'import.csv',
        path: '/test/import.csv',
        type: 'text/csv',
      }];

      // FileExtractor.extractText をモック（API設定を含むCSV）
      mockExtractText.mockResolvedValue({
        content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,,,http://new-api.com,new-key,new-model
項目2,,,,,,`,
        metadata: {},
      });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // SETTINGS_UPDATEDイベントが発火したことを検証
      expect(mockPublishEvent).toHaveBeenCalledWith(
        IpcChannels.SETTINGS_UPDATED,
        undefined
      );

      // settingsRepository.saveSettingsが呼ばれたことを検証
      expect(mockSettingsRepository.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          api: {
            key: 'new-key',
            url: 'http://new-api.com',
            model: 'new-model',
          },
        })
      );

      // REVIEW_EXTRACT_CHECKLIST_FINISHEDイベントも発火すること
      expect(mockPublishEvent).toHaveBeenCalledWith(
        IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
        expect.objectContaining({
          reviewHistoryId: 'review-1',
          status: 'success',
        })
      );
    });

    it('API設定の一部のみ指定された場合、既存設定とマージされること', async () => {
      const mockFiles: UploadFile[] = [{
        id: 'file-1',
        name: 'import.csv',
        path: '/test/import.csv',
        type: 'text/csv',
      }];

      // APIキーのみ更新するCSV
      mockExtractText.mockResolvedValue({
        content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,,,,new-key-only,`,
        metadata: {},
      });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // 既存のURLとmodelは保持され、keyのみ更新されること
      expect(mockSettingsRepository.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          api: {
            key: 'new-key-only',
            url: 'http://old.com', // 既存値を保持
            model: 'old-model', // 既存値を保持
          },
        })
      );

      // SETTINGS_UPDATEDイベントが発火すること
      expect(mockPublishEvent).toHaveBeenCalledWith(
        IpcChannels.SETTINGS_UPDATED,
        undefined
      );
    });
  });

  describe('API設定を含まないCSVインポート', () => {
    it('API設定を含まないCSVインポート時はSETTINGS_UPDATEDイベントが発火しないこと', async () => {
      const mockFiles: UploadFile[] = [{
        id: 'file-1',
        name: 'import.csv',
        path: '/test/import.csv',
        type: 'text/csv',
      }];

      // API設定を含まないCSV
      mockExtractText.mockResolvedValue({
        content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,,,,
項目2,,,,,,`,
        metadata: {},
      });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // SETTINGS_UPDATEDイベントが発火していないことを検証
      expect(mockPublishEvent).not.toHaveBeenCalledWith(
        IpcChannels.SETTINGS_UPDATED,
        undefined
      );

      // settingsRepository.saveSettingsが呼ばれていないことを検証
      expect(mockSettingsRepository.saveSettings).not.toHaveBeenCalled();

      // REVIEW_EXTRACT_CHECKLIST_FINISHEDイベントは発火すること
      expect(mockPublishEvent).toHaveBeenCalledWith(
        IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
        expect.objectContaining({
          reviewHistoryId: 'review-1',
          status: 'success',
        })
      );
    });

    it('チェックリスト項目のみのCSVでも正常に処理されること', async () => {
      const mockFiles: UploadFile[] = [{
        id: 'file-1',
        name: 'import.csv',
        path: '/test/import.csv',
        type: 'text/csv',
      }];

      mockExtractText.mockResolvedValue({
        content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,,,,
項目2,,,,,,
項目3,,,,,,`,
        metadata: {},
      });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // チェックリスト作成が3回呼ばれること
      expect(mockReviewRepository.createChecklist).toHaveBeenCalledTimes(3);
      expect(mockReviewRepository.createChecklist).toHaveBeenCalledWith(
        'review-1',
        '項目1',
        'system'
      );
      expect(mockReviewRepository.createChecklist).toHaveBeenCalledWith(
        'review-1',
        '項目2',
        'system'
      );
      expect(mockReviewRepository.createChecklist).toHaveBeenCalledWith(
        'review-1',
        '項目3',
        'system'
      );
    });
  });

  describe('評定設定・追加指示・コメントフォーマットを含むCSVインポート', () => {
    it('評定設定が正しくDB更新されること', async () => {
      const mockFiles: UploadFile[] = [{
        id: 'file-1',
        name: 'import.csv',
        path: '/test/import.csv',
        type: 'text/csv',
      }];

      mockExtractText.mockResolvedValue({
        content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,,,,
,A,優秀,,,,,
,B,良好,,,,,`,
        metadata: {},
      });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // 評定設定の更新が呼ばれること
      expect(mockReviewRepository.updateReviewHistoryEvaluationSettings).toHaveBeenCalledWith(
        'review-1',
        expect.objectContaining({
          items: [
            { label: 'A', description: '優秀' },
            { label: 'B', description: '良好' },
          ],
        })
      );
    });

    it('追加指示とコメントフォーマットが正しくDB更新されること', async () => {
      const mockFiles: UploadFile[] = [{
        id: 'file-1',
        name: 'import.csv',
        path: '/test/import.csv',
        type: 'text/csv',
      }];

      mockExtractText.mockResolvedValue({
        content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,厳格にレビューしてください,【評価】{evaluation},,`,
        metadata: {},
      });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // 追加指示とコメントフォーマットの更新が呼ばれること
      expect(mockReviewRepository.updateReviewHistoryAdditionalInstructionsAndCommentFormat).toHaveBeenCalledWith(
        'review-1',
        '厳格にレビューしてください',
        '【評価】{evaluation}'
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('CSVパースエラー時はREVIEW_EXTRACT_CHECKLIST_FINISHEDイベント（失敗）が発火すること', async () => {
      const mockFiles: UploadFile[] = [{
        id: 'file-1',
        name: 'import.csv',
        path: '/test/import.csv',
        type: 'text/csv',
      }];

      // 不正なCSVフォーマット
      mockExtractText.mockResolvedValue({
        content: `invalid,header
データ1,データ2`,
        metadata: {},
      });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // REVIEW_EXTRACT_CHECKLIST_FINISHEDイベント（失敗）が発火すること
      expect(mockPublishEvent).toHaveBeenCalledWith(
        IpcChannels.REVIEW_EXTRACT_CHECKLIST_FINISHED,
        expect.objectContaining({
          reviewHistoryId: 'review-1',
          status: 'failed',
          error: expect.any(String),
        })
      );

      // SETTINGS_UPDATEDイベントは発火しないこと
      expect(mockPublishEvent).not.toHaveBeenCalledWith(
        IpcChannels.SETTINGS_UPDATED,
        undefined
      );
    });
  });

  describe('複数ファイルのCSVインポート', () => {
    it('複数ファイルの場合、最初のファイルの設定値が優先されること', async () => {
      const mockFiles: UploadFile[] = [
        {
          id: 'file-1',
          name: 'import1.csv',
          path: '/test/import1.csv',
          type: 'text/csv',
        },
        {
          id: 'file-2',
          name: 'import2.csv',
          path: '/test/import2.csv',
          type: 'text/csv',
        },
      ];

      // 1つ目のファイルにAPI設定あり
      mockExtractText
        .mockResolvedValueOnce({
          content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目1,,,,,http://first.com,first-key,first-model`,
          metadata: {},
        })
        // 2つ目のファイルにも異なるAPI設定あり（無視されるべき）
        .mockResolvedValueOnce({
          content: `チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,BPR ID
項目2,,,,,http://second.com,second-key,second-model`,
          metadata: {},
        });

      await reviewService.extractChecklistFromCsv('review-1', mockFiles);

      // 1つ目のファイルの設定が使用されること
      expect(mockSettingsRepository.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          api: {
            key: 'first-key',
            url: 'http://first.com',
            model: 'first-model',
          },
        })
      );

      // チェックリスト項目は両方とも登録されること
      expect(mockReviewRepository.createChecklist).toHaveBeenCalledWith(
        'review-1',
        '項目1',
        'system'
      );
      expect(mockReviewRepository.createChecklist).toHaveBeenCalledWith(
        'review-1',
        '項目2',
        'system'
      );
    });
  });
});
