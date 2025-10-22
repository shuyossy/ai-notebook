/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { RevieHistory, ReviewChecklistResult } from '@/types';
import ReviewArea from '@/renderer/components/review/ReviewArea';
import ReviewSourceModal from '@/renderer/components/review/ReviewSourceModal';
import { createMockElectronWithOptions } from './test-utils/mockElectronHandler';
import { alertStore, type AlertMessage } from '@/renderer/stores/alertStore';
import * as pdfUtils from '@/renderer/lib/pdfUtils';

// PDF Utilsのモック
jest.mock('@/renderer/lib/pdfUtils', () => ({
  convertPdfBytesToImages: jest.fn().mockResolvedValue([]),
  combineImages: jest.fn().mockResolvedValue(''),
}));

// CSV Utilsのモック
jest.mock('@/renderer/lib/csvUtils', () => ({
  convertReviewResultsToCSV: jest.fn().mockReturnValue(''),
  downloadCSV: jest.fn(),
  generateCSVFilename: jest.fn().mockReturnValue('review.csv'),
}));

// ライブラリのモック
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => ({}),
}));

jest.mock('react-syntax-highlighter', () => ({
  __esModule: true,
  Prism: ({ children }: { children: string }) => <pre>{children}</pre>,
}));

// mermaidのモック
jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: jest.fn().mockResolvedValue({ svg: '<svg>test</svg>' }),
  },
}));

// File APIのモック
global.URL.createObjectURL = jest.fn(
  (blob: any) => `mock-url-${blob.name || 'file'}`,
);
global.URL.revokeObjectURL = jest.fn();

// テスト用のモックデータ
const mockReviewHistory: RevieHistory = {
  id: 'review-1',
  title: 'テストレビュー',
  targetDocumentName: 'test-document.pdf',
  additionalInstructions: null,
  commentFormat: null,
  evaluationSettings: null,
  processingStatus: 'idle',
  createdAt: '2025-05-01T12:00:00.000Z',
  updatedAt: '2025-05-01T12:00:00.000Z',
};

const mockChecklistResults: ReviewChecklistResult[] = [
  {
    id: 1,
    content: 'チェック項目1',
  },
  {
    id: 2,
    content: 'チェック項目2',
    sourceEvaluation: {
      evaluation: 'A',
      comment: '問題ありません',
    },
  },
];

describe('ReviewArea - チェックリスト抽出', () => {
  beforeEach(() => {
    window.electron = createMockElectronWithOptions({
      reviewHistory: mockReviewHistory,
      reviewChecklistResults: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('チェックリスト抽出用モーダル', () => {
    it('レビュー履歴未選択時はプレースホルダーメッセージが表示されること', async () => {
      render(<ReviewArea selectedReviewHistoryId={null} />);

      await waitFor(() => {
        expect(
          screen.getByText(
            '新規レビューを開始または既存のレビュー履歴を選択してください',
          ),
        ).toBeInTheDocument();
      });
    });

    it('チェックリスト抽出ボタンをクリックするとモーダルが開くこと', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      fireEvent.click(extractButton);

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });
    });

    it('モーダルでドキュメント種別を選択できること', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // デフォルトでチェックリストドキュメント（AI抽出）が選択されていることを確認
      const aiRadioLabel = screen.getByText(
        'チェックリストドキュメント（AI抽出）',
      );
      expect(aiRadioLabel).toBeInTheDocument();

      // ファイルインポートを選択
      const csvRadioLabel = screen.getByText(
        /チェックリストドキュメント（ファイルインポート）/,
      );
      await act(async () => {
        fireEvent.click(csvRadioLabel);
      });

      // 一般ドキュメントを選択
      const generalRadioLabel = screen.getByText(
        /一般ドキュメント（新規チェックリスト作成）/,
      );
      await act(async () => {
        fireEvent.click(generalRadioLabel);
      });

      // 選択が有効であることを確認
      expect(generalRadioLabel).toBeInTheDocument();
    });

    it('一般ドキュメント選択時にチェックリスト作成要件の入力欄が表示されること', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      fireEvent.click(extractButton);

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 一般ドキュメントを選択
      const generalRadio = screen.getByRole('radio', {
        name: /一般ドキュメント（新規チェックリスト作成）/,
      });
      fireEvent.click(generalRadio);

      // チェックリスト作成要件の入力欄が表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByLabelText('チェックリスト作成要件'),
        ).toBeInTheDocument();
      });
    });

    it('ファイル選択ダイアログを開けること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/file1.pdf', '/test/file2.pdf'],
        },
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      fireEvent.click(extractButton);

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(mockShowOpenDialog).toHaveBeenCalled();
      });
    });

    it('CSV選択時にExcel/CSV以外のファイルでエラーが表示されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/file.pdf'],
        },
      });

      const mockExtractChecklist = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.review.extractChecklist = mockExtractChecklist;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // ファイルインポートを選択（テキストで検索）
      const csvRadioLabel = screen.getByText(
        /チェックリストドキュメント（ファイルインポート）/,
      );
      await act(async () => {
        fireEvent.click(csvRadioLabel);
      });

      // ファイルをアップロード
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(mockShowOpenDialog).toHaveBeenCalled();
      });

      // PDFファイルが選択されている状態で送信
      await waitFor(() => {
        expect(screen.getByText('file.pdf')).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });

      // 送信ボタンが有効になるまで待機
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      // エラーメッセージがalertStoreに追加されることを確認
      await waitFor(() => {
        const alerts = alertStore.getState().alerts;
        const hasError = alerts.some((alert: AlertMessage) =>
          alert.message.includes(
            'ファイルインポートを選択している場合はExcelまたはCSVファイルのみ指定可能です',
          ),
        );
        expect(hasError).toBe(true);
      });

      // バリデーションエラーのため、extractChecklistが呼ばれないことを確認
      expect(mockExtractChecklist).not.toHaveBeenCalled();
    });

    it('モーダルをキャンセルできること', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      fireEvent.click(extractButton);

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(
          screen.queryByText('チェックリスト抽出対象ファイルのアップロード'),
        ).not.toBeInTheDocument();
      });
    });

    it('ファイル未選択時は送信ボタンが無効化されること', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      fireEvent.click(extractButton);

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('チェックリスト抽出処理', () => {
    it('チェックリスト抽出中はローディングインジケータが表示されること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: [],
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        // LinearProgressが表示されることを確認
        const progress = document.querySelector('.MuiLinearProgress-root');
        expect(progress).toBeInTheDocument();
      });
    });

    it('チェックリスト抽出中はボタンが「キャンセル」に変わること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: [],
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('キャンセル')).toBeInTheDocument();
      });
    });

    it('チェックリスト抽出中はレビュー実行ボタンが無効化されること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: mockChecklistResults,
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        const reviewButton = screen.getByRole('button', {
          name: /レビュー実行/,
        });
        expect(reviewButton).toBeDisabled();
      });
    });

    it('キャンセルボタンをクリックするとabortExtractChecklistが呼ばれること', async () => {
      const mockAbortExtractChecklist = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: [],
      });
      window.electron.review.abortExtractChecklist = mockAbortExtractChecklist;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('キャンセル')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(mockAbortExtractChecklist).toHaveBeenCalledWith('review-1');
      });
    });
  });

  describe('チェックリスト抽出結果表示', () => {
    it('チェックリスト結果が正しく表示されること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェック項目1')).toBeInTheDocument();
        expect(screen.getByText('チェック項目2')).toBeInTheDocument();
      });
    });

    it('レビュー結果が表示されること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('A')).toBeInTheDocument();
        expect(screen.getByText('問題ありません')).toBeInTheDocument();
      });
    });

    it('初回データ取得失敗時にポーリングで再試行されること', async () => {
      jest.useFakeTimers();
      let callCount = 0;
      const mockGetHistoryDetail = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          success: true as const,
          data: {
            checklistResults: mockChecklistResults,
            targetDocumentName: 'test-document.pdf',
          },
        });
      });

      const mockGetHistoryById = jest.fn().mockResolvedValue({
        success: true as const,
        data: mockReviewHistory,
      });

      const mockGetHistoryInstruction = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          additionalInstructions: '',
          commentFormat:
            '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）',
          evaluationSettings: {
            items: [
              { label: 'A', description: '基準を完全に満たしている' },
              { label: 'B', description: '基準をある程度満たしている' },
              { label: 'C', description: '基準を満たしていない' },
              { label: '–', description: '評価の対象外、または評価できない' },
            ],
          },
        },
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // 初回実行を待つ
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockGetHistoryDetail).toHaveBeenCalledTimes(1);

      // ポーリングの5秒進める
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      // ポーリングで再試行されることを確認
      expect(mockGetHistoryDetail).toHaveBeenCalledTimes(2);

      // 最終的にデータが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText('チェック項目1')).toBeInTheDocument();
      });

      jest.useRealTimers();
    }, 10000);
  });

  describe('チェックリスト抽出処理のポーリングとイベント受信', () => {
    it('チェックリスト抽出中は5秒ごとにチェックリスト結果がポーリングされること', async () => {
      jest.useFakeTimers();

      const mockGetHistoryDetail = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          checklistResults: mockChecklistResults,
          targetDocumentName: 'test-document.pdf',
        },
      });

      const mockGetHistoryById = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
      });

      const mockGetHistoryInstruction = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          additionalInstructions: '',
          commentFormat:
            '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）',
          evaluationSettings: {
            items: [
              { label: 'A', description: '基準を完全に満たしている' },
              { label: 'B', description: '基準をある程度満たしている' },
              { label: 'C', description: '基準を満たしていない' },
              { label: '–', description: '評価の対象外、または評価できない' },
            ],
          },
        },
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: mockChecklistResults,
      });

      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // 初回データ取得を待つ
      await act(async () => {
        await Promise.resolve();
      });

      const initialCallCount = mockGetHistoryDetail.mock.calls.length;

      // 5秒進めてポーリングが実行されることを確認
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      expect(mockGetHistoryDetail.mock.calls.length).toBe(initialCallCount + 1);

      // さらに5秒進めて2回目のポーリングが実行されることを確認
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      expect(mockGetHistoryDetail.mock.calls.length).toBe(initialCallCount + 2);

      jest.useRealTimers();
    }, 10000);

    it('チェックリスト抽出完了イベント（成功）を受信したら、結果を再取得してポーリングを停止すること', async () => {
      jest.useFakeTimers();

      let eventCallback: ((event: any) => void) | null = null;
      const mockSubscribe = jest.fn((eventType: string, callback: any) => {
        if (eventType === 'review-extract-checklist-finished') {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const mockGetHistoryDetail = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          checklistResults: mockChecklistResults,
          targetDocumentName: 'test-document.pdf',
        },
      });

      const mockGetHistoryById = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          ...mockReviewHistory,
          processingStatus: 'extracting', // 処理中の状態にする
        },
      });

      const mockGetHistoryInstruction = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          additionalInstructions: '',
          commentFormat:
            '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）',
          evaluationSettings: {
            items: [
              { label: 'A', description: '基準を完全に満たしている' },
              { label: 'B', description: '基準をある程度満たしている' },
              { label: 'C', description: '基準を満たしていない' },
              { label: '–', description: '評価の対象外、または評価できない' },
            ],
          },
        },
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: [],
      });

      window.electron.pushApi.subscribe = mockSubscribe as any;
      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // 初回データ取得を待つ（この時点でイベント購読が設定される）
      await act(async () => {
        await Promise.resolve();
      });

      // イベントコールバックが設定されていることを確認
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
        expect(eventCallback).not.toBeNull();
      });

      const callCountBeforeEvent = mockGetHistoryDetail.mock.calls.length;

      // 抽出完了イベントを発火
      await act(async () => {
        if (eventCallback) {
          eventCallback({
            payload: {
              reviewHistoryId: 'review-1',
              status: 'success',
            },
          });
        }
        await Promise.resolve();
      });

      // fetchChecklistResultsが再度呼ばれることを確認
      expect(mockGetHistoryDetail.mock.calls.length).toBeGreaterThan(
        callCountBeforeEvent,
      );

      // 成功メッセージがalertStoreに追加されることを確認
      await waitFor(() => {
        const alerts = alertStore.getState().alerts;
        const hasSuccess = alerts.some((alert: AlertMessage) =>
          alert.message.includes('チェックリストの抽出が完了しました'),
        );
        expect(hasSuccess).toBe(true);
      });

      // ポーリングが停止することを確認（タイマーを進めても追加で呼ばれない）
      const callCountAfterEvent = mockGetHistoryDetail.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      expect(mockGetHistoryDetail.mock.calls.length).toBe(callCountAfterEvent);

      jest.useRealTimers();
    }, 15000);

    it('チェックリスト抽出完了イベント（失敗）を受信したら、エラーメッセージを表示してポーリングを停止すること', async () => {
      jest.useFakeTimers();

      let eventCallback: ((event: any) => void) | null = null;
      const mockSubscribe = jest.fn((eventType: string, callback: any) => {
        if (eventType === 'review-extract-checklist-finished') {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const mockGetHistoryDetail = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          checklistResults: [],
          targetDocumentName: null,
        },
      });

      const mockGetHistoryById = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          ...mockReviewHistory,
          processingStatus: 'extracting', // 処理中の状態にする
        },
      });

      const mockGetHistoryInstruction = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          additionalInstructions: '',
          commentFormat:
            '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）',
          evaluationSettings: {
            items: [
              { label: 'A', description: '基準を完全に満たしている' },
              { label: 'B', description: '基準をある程度満たしている' },
              { label: 'C', description: '基準を満たしていない' },
              { label: '–', description: '評価の対象外、または評価できない' },
            ],
          },
        },
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: [],
      });

      window.electron.pushApi.subscribe = mockSubscribe as any;
      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // 初回データ取得を待つ
      await act(async () => {
        await Promise.resolve();
      });

      // イベントコールバックが設定されるまで待つ
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
        expect(eventCallback).not.toBeNull();
      });

      // 抽出失敗イベントを発火
      await act(async () => {
        if (eventCallback) {
          eventCallback({
            payload: {
              reviewHistoryId: 'review-1',
              status: 'failed',
              error: 'テストエラー',
            },
          });
        }
        await Promise.resolve();
      });

      // エラーメッセージがalertStoreに追加されることを確認
      await waitFor(() => {
        const alerts = alertStore.getState().alerts;
        const hasError = alerts.some(
          (alert: AlertMessage) =>
            alert.message.includes('チェックリストの抽出に失敗しました') &&
            alert.message.includes('テストエラー'),
        );
        expect(hasError).toBe(true);
      });

      // ポーリングが停止することを確認
      const callCountAfterEvent = mockGetHistoryDetail.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      expect(mockGetHistoryDetail.mock.calls.length).toBe(callCountAfterEvent);

      jest.useRealTimers();
    }, 15000);

    it('チェックリスト抽出完了イベント（キャンセル）を受信したら、キャンセルメッセージを表示してポーリングを停止すること', async () => {
      jest.useFakeTimers();

      let eventCallback: ((event: any) => void) | null = null;
      const mockSubscribe = jest.fn((eventType: string, callback: any) => {
        if (eventType === 'review-extract-checklist-finished') {
          eventCallback = callback;
        }
        return Promise.resolve(() => {});
      });

      const mockGetHistoryDetail = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          checklistResults: [],
          targetDocumentName: null,
        },
      });

      const mockGetHistoryById = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          ...mockReviewHistory,
          processingStatus: 'extracting', // 処理中の状態にする
        },
      });

      const mockGetHistoryInstruction = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          additionalInstructions: '',
          commentFormat:
            '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）',
          evaluationSettings: {
            items: [
              { label: 'A', description: '基準を完全に満たしている' },
              { label: 'B', description: '基準をある程度満たしている' },
              { label: 'C', description: '基準を満たしていない' },
              { label: '–', description: '評価の対象外、または評価できない' },
            ],
          },
        },
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: [],
      });

      window.electron.pushApi.subscribe = mockSubscribe as any;
      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // 初回データ取得を待つ
      await act(async () => {
        await Promise.resolve();
      });

      // イベントコールバックが設定されるまで待つ
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
        expect(eventCallback).not.toBeNull();
      });

      // 抽出キャンセルイベントを発火
      await act(async () => {
        if (eventCallback) {
          eventCallback({
            payload: {
              reviewHistoryId: 'review-1',
              status: 'canceled',
            },
          });
        }
        await Promise.resolve();
      });

      // キャンセルメッセージがalertStoreに追加されることを確認
      await waitFor(() => {
        const alerts = alertStore.getState().alerts;
        const hasCancel = alerts.some((alert: AlertMessage) =>
          alert.message.includes('チェックリスト抽出をキャンセルしました'),
        );
        expect(hasCancel).toBe(true);
      });

      // ポーリングが停止することを確認
      const callCountAfterEvent = mockGetHistoryDetail.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      expect(mockGetHistoryDetail.mock.calls.length).toBe(callCountAfterEvent);

      jest.useRealTimers();
    }, 15000);

    it('チェックリスト抽出のポーリング中にチェックリスト結果が更新されること', async () => {
      jest.useFakeTimers();

      let callCount = 0;
      const mockGetHistoryDetail = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true as const,
            data: {
              checklistResults: [],
              targetDocumentName: null,
            },
          });
        } else if (callCount === 2) {
          return Promise.resolve({
            success: true as const,
            data: {
              checklistResults: [mockChecklistResults[0]],
              targetDocumentName: 'test-document.pdf',
            },
          });
        } else {
          return Promise.resolve({
            success: true as const,
            data: {
              checklistResults: mockChecklistResults,
              targetDocumentName: 'test-document.pdf',
            },
          });
        }
      });

      const mockGetHistoryById = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
      });

      const mockGetHistoryInstruction = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          additionalInstructions: '',
          commentFormat:
            '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）',
          evaluationSettings: {
            items: [
              { label: 'A', description: '基準を完全に満たしている' },
              { label: 'B', description: '基準をある程度満たしている' },
              { label: 'C', description: '基準を満たしていない' },
              { label: '–', description: '評価の対象外、または評価できない' },
            ],
          },
        },
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'extracting',
        },
        reviewChecklistResults: [],
      });

      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // 初回データ取得を待つ（空のチェックリスト）
      await act(async () => {
        await Promise.resolve();
      });

      // 5秒進めて1回目のポーリング（1件のチェックリスト）
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('チェック項目1')).toBeInTheDocument();
      });

      // さらに5秒進めて2回目のポーリング（2件のチェックリスト）
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('チェック項目1')).toBeInTheDocument();
        expect(screen.getByText('チェック項目2')).toBeInTheDocument();
      });

      jest.useRealTimers();
    }, 15000);
  });

  describe('チェックリスト抽出のIPC呼び出し', () => {
    it('チェックリストドキュメント（AI抽出）でextractChecklistが正しく呼ばれること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/checklist.pdf'],
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // PDF header
      });

      const mockExtractChecklist = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.extractChecklist = mockExtractChecklist;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      // チェックリスト抽出ボタンをクリック
      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // デフォルトでチェックリストドキュメント（AI抽出）が選択されている

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('checklist.pdf')).toBeInTheDocument();
      });

      // 送信
      const submitButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(submitButton);
      });

      // extractChecklistが正しい引数で呼ばれることを確認
      await waitFor(() => {
        expect(mockExtractChecklist).toHaveBeenCalledWith({
          reviewHistoryId: 'review-1',
          files: expect.arrayContaining([
            expect.objectContaining({
              name: 'checklist.pdf',
              path: '/test/checklist.pdf',
              processMode: 'text',
            }),
          ]),
          documentType: 'checklist-ai',
        });
      });
    });

    it('チェックリストドキュメント（ファイルインポート）でextractChecklistが正しく呼ばれること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/checklist.xlsx'],
        },
      });

      const mockExtractChecklist = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.review.extractChecklist = mockExtractChecklist;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      // チェックリスト抽出ボタンをクリック
      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // ファイルインポートを選択
      const csvRadioLabel = screen.getByText(
        /チェックリストドキュメント（ファイルインポート）/,
      );
      await act(async () => {
        fireEvent.click(csvRadioLabel);
      });

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('checklist.xlsx')).toBeInTheDocument();
      });

      // 送信
      const submitButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(submitButton);
      });

      // extractChecklistが正しい引数で呼ばれることを確認
      await waitFor(() => {
        expect(mockExtractChecklist).toHaveBeenCalledWith({
          reviewHistoryId: 'review-1',
          files: expect.arrayContaining([
            expect.objectContaining({
              name: 'checklist.xlsx',
              path: '/test/checklist.xlsx',
            }),
          ]),
          documentType: 'checklist-csv',
        });
      });
    });
  });

  describe('Officeファイル画像化機能', () => {
    it('PDFファイルの処理モードをテキスト抽出から画像化に切り替えられること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // PDF signature
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // ファイルをアップロード
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(mockShowOpenDialog).toHaveBeenCalled();
        expect(screen.getByText('document.pdf')).toBeInTheDocument();
      });

      // デフォルトで「テキスト抽出」が選択されていることを確認
      const textRadio = screen.getAllByRole('radio', {
        name: /テキスト抽出/,
      })[0];
      expect(textRadio).toBeChecked();

      // 「画像化」に切り替え
      const imageRadioLabel = screen.getAllByText(/^画像$/)[0];
      await act(async () => {
        fireEvent.click(imageRadioLabel);
      });

      const imageRadio = screen.getAllByRole('radio', { name: /^画像$/ })[0];
      expect(imageRadio).toBeChecked();
    });

    it('画像化モードをページ毎から統合画像に切り替えられること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document.pdf'],
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // ファイルをアップロード
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('document.pdf')).toBeInTheDocument();
      });

      // 「画像」に切り替え
      const imageRadioLabel = screen.getAllByText(/^画像$/)[0];
      await act(async () => {
        fireEvent.click(imageRadioLabel);
      });

      // デフォルトで「ページ別画像」が選択されていることを確認
      await waitFor(() => {
        const pagesRadio = screen.getAllByRole('radio', {
          name: /ページ別画像/,
        })[0];
        expect(pagesRadio).toBeChecked();
      });

      // 「統合画像」に切り替え
      const mergedRadioLabel = screen.getAllByText(/^統合画像$/)[0];
      await act(async () => {
        fireEvent.click(mergedRadioLabel);
      });

      const mergedRadio = screen.getAllByRole('radio', {
        name: /^統合画像$/,
      })[0];
      expect(mergedRadio).toBeChecked();
    });

    it('一括設定で全ファイルの処理モードを画像化（ページ毎）に変更できること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document1.pdf', '/test/document2.pdf'],
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // ファイルをアップロード
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('document1.pdf')).toBeInTheDocument();
        expect(screen.getByText('document2.pdf')).toBeInTheDocument();
      });

      // 一括設定セクションで「画像化（ページ毎）」を選択
      const bulkImagePagesRadio = screen.getAllByRole('radio', {
        name: /画像化（ページ毎）/,
      })[0]; // 一括設定の方
      await act(async () => {
        fireEvent.click(bulkImagePagesRadio);
      });

      // 「適用」ボタンをクリック
      const applyButton = screen.getByRole('button', { name: /適用/ });
      await act(async () => {
        fireEvent.click(applyButton);
      });

      // 全ファイルの処理モードが「画像」、画像化モードが「ページ別画像」に変更されたことを確認
      const imageRadios = screen.getAllByRole('radio', { name: /^画像$/ });
      imageRadios.forEach((radio) => {
        // 一括設定のラジオボタン以外をチェック
        if (radio !== bulkImagePagesRadio) {
          expect(radio).toBeChecked();
        }
      });
      // ページ別画像のラジオボタンが選択されていることも確認
      await waitFor(() => {
        const pagesRadios = screen.getAllByRole('radio', {
          name: /ページ別画像/,
        });
        // 一括設定以外のpagesRadiosがチェックされていること
        const filePagesRadios = pagesRadios.filter(
          (r) => r !== bulkImagePagesRadio,
        );
        filePagesRadios.forEach((radio) => {
          expect(radio).toBeChecked();
        });
      });
    });

    it('一括設定で全ファイルの処理モードを画像化（統合）に変更できること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true,
        data: {
          canceled: false,
          filePaths: ['/test/document1.pdf', '/test/document2.pdf'],
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // ファイルをアップロード
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('document1.pdf')).toBeInTheDocument();
        expect(screen.getByText('document2.pdf')).toBeInTheDocument();
      });

      // 一括設定セクションで「画像化（統合）」を選択
      const bulkImageMergedRadio = screen.getAllByRole('radio', {
        name: /画像化（統合）/,
      })[0]; // 一括設定の方
      await act(async () => {
        fireEvent.click(bulkImageMergedRadio);
      });

      // 「適用」ボタンをクリック
      const applyButton = screen.getByRole('button', { name: /適用/ });
      await act(async () => {
        fireEvent.click(applyButton);
      });

      // 全ファイルの処理モードが「画像」、画像モードが「統合画像」に変更されたことを確認
      const imageRadios = screen.getAllByRole('radio', { name: /^画像$/ });
      imageRadios.forEach((radio) => {
        if (radio !== bulkImageMergedRadio) {
          expect(radio).toBeChecked();
        }
      });

      // 統合画像のラジオボタンが選択されていることも確認
      await waitFor(() => {
        const mergedRadios = screen.getAllByRole('radio', { name: /統合画像/ });
        // 一括設定以外のmergedRadiosがチェックされていること
        const fileMergedRadios = mergedRadios.filter(
          (r) => r !== bulkImageMergedRadio,
        );
        fileMergedRadios.forEach((radio) => {
          expect(radio).toBeChecked();
        });
      });
    });

    it('Officeファイルを画像化する際にOffice→PDF変換が実行されること', async () => {
      // PDF→画像変換のモックを準備（jest.spyOnを使用）
      const mockConvertPdfBytesToImages = jest
        .spyOn(pdfUtils, 'convertPdfBytesToImages')
        .mockResolvedValue([
          'data:image/png;base64,mock-image-1',
          'data:image/png;base64,mock-image-2',
        ]);

      // Office→PDF変換のモックを準備
      const mockConvertOfficeToPdf = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // PDF header
      });

      // showOpenDialogのモック
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.xlsx'],
          canceled: false,
        },
      });

      // extractChecklistのモック
      const mockExtractChecklist = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.convertOfficeToPdf = mockConvertOfficeToPdf;
      window.electron.review.extractChecklist = mockExtractChecklist;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // レビュー履歴が読み込まれることを確認
      await waitFor(() => {
        expect(screen.getByText('チェックリスト抽出')).toBeInTheDocument();
      });

      // チェックリスト抽出ボタンをクリック
      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(extractButton);
      });

      // モーダルが開いたことを確認
      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 一般ドキュメントのラジオボタンを選択
      const generalRadio = screen.getByRole('radio', {
        name: /一般ドキュメント（新規チェックリスト作成）/,
      });
      await act(async () => {
        fireEvent.click(generalRadio);
      });

      // チェックリスト作成要件の入力欄が表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByLabelText('チェックリスト作成要件'),
        ).toBeInTheDocument();
      });

      // ファイル選択ボタンをクリック
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      // ファイルが追加されたことを確認
      await waitFor(() => {
        expect(screen.getByText('test.xlsx')).toBeInTheDocument();
      });

      // 画像モードに切り替え
      const imageRadioLabel = screen.getAllByText(/^画像$/)[0];
      await act(async () => {
        fireEvent.click(imageRadioLabel);
      });

      // チェックリスト作成要件を入力
      const requirementInput = screen.getByLabelText('チェックリスト作成要件')
      fireEvent.change(requirementInput, { target: { value: 'テスト要件' } });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /チェックリスト抽出/,
      });
      await act(async () => {
        fireEvent.click(submitButton);
      });

      // Office→PDF変換が呼ばれたことを確認
      await waitFor(() => {
        expect(mockConvertOfficeToPdf).toHaveBeenCalled();
      });

      // PDF→画像変換も呼ばれたことを確認
      await waitFor(() => {
        expect(mockConvertPdfBytesToImages).toHaveBeenCalled();
      });

      // extractChecklistが正しい引数で呼ばれることを確認
      await waitFor(() => {
        expect(mockExtractChecklist).toHaveBeenCalledWith({
          reviewHistoryId: 'review-1',
          files: expect.arrayContaining([
            expect.objectContaining({
              name: 'test.xlsx',
              path: '/path/to/test.xlsx',
              processMode: 'image',
              imageMode: 'pages',
              imageData: [
                'data:image/png;base64,mock-image-1',
                'data:image/png;base64,mock-image-2',
              ],
            }),
          ]),
          documentType: 'general',
          checklistRequirements: 'テスト要件',
        });
      });

      // モックをリストア
      mockConvertPdfBytesToImages.mockRestore();
    });

    it('PDFファイルをページ毎画像化する際にconvertPdfBytesToImagesが呼ばれること', async () => {
      // PDF→画像変換のモックを準備（jest.spyOnを使用）
      const mockConvertPdfBytesToImages = jest
        .spyOn(pdfUtils, 'convertPdfBytesToImages')
        .mockResolvedValue([
          'data:image/png;base64,mock-image-1',
          'data:image/png;base64,mock-image-2',
        ]);

      // PDFファイル読み込みのモックを準備
      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // PDF header
      });

      // showOpenDialogのモック
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      // extractChecklistのモック
      const mockExtractChecklist = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.extractChecklist = mockExtractChecklist;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト抽出ボタンをクリック
      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/i,
      });
      await userEvent.click(extractButton);

      // モーダルが開いたことを確認
      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 一般ドキュメントを選択
      const generalRadio = screen.getByRole('radio', {
        name: /一般ドキュメント（新規チェックリスト作成）/,
      });
      await act(async () => {
        fireEvent.click(generalRadio);
      });

      // ファイル選択ボタンをクリック
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      // ファイルが追加されたことを確認
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // 画像化モード（ページ毎）に切り替え
      const imageRadioLabel = screen.getByText(/^画像$/);
      await userEvent.click(imageRadioLabel);

      // ページ別がデフォルトで選択されていることを確認
      const pagesRadio = screen.getByLabelText(/ページ別画像/);
      expect(pagesRadio).toBeChecked();

      // チェックリスト作成要件を入力
      const requirementInput = screen.getByLabelText('チェックリスト作成要件');
      await userEvent.type(requirementInput, 'テスト要件');

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /チェックリスト抽出/i });
      await userEvent.click(submitButton);

      // PDF読み込みが呼ばれたことを確認
      await waitFor(() => {
        expect(mockReadFile).toHaveBeenCalled();
      });

      // PDF→画像変換が呼ばれたことを確認
      await waitFor(() => {
        expect(mockConvertPdfBytesToImages).toHaveBeenCalledWith(
          expect.any(Uint8Array),
          { scale: 2.0 },
        );
      });

      // extractChecklistが正しい引数で呼ばれることを確認
      await waitFor(() => {
        expect(mockExtractChecklist).toHaveBeenCalledWith({
          reviewHistoryId: 'review-1',
          files: expect.arrayContaining([
            expect.objectContaining({
              name: 'test.pdf',
              path: '/path/to/test.pdf',
              processMode: 'image',
              imageMode: 'pages',
              imageData: [
                'data:image/png;base64,mock-image-1',
                'data:image/png;base64,mock-image-2',
              ],
            }),
          ]),
          documentType: 'general',
          checklistRequirements: 'テスト要件',
        });
      });

      // モックをリストア
      mockConvertPdfBytesToImages.mockRestore();
    });

    it('PDFファイルを統合画像化する際にconvertPdfBytesToImagesとcombineImagesが呼ばれること', async () => {
      // PDF→画像変換のモックを準備（jest.spyOnを使用）
      const mockConvertPdfBytesToImages = jest
        .spyOn(pdfUtils, 'convertPdfBytesToImages')
        .mockResolvedValue([
          'data:image/png;base64,mock-image-1',
          'data:image/png;base64,mock-image-2',
        ]);

      // 画像統合のモックを準備（jest.spyOnを使用）
      const mockCombineImages = jest
        .spyOn(pdfUtils, 'combineImages')
        .mockResolvedValue('data:image/png;base64,mock-combined-image');

      // PDFファイル読み込みのモックを準備
      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // PDF header
      });

      // showOpenDialogのモック
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      // extractChecklistのモック
      const mockExtractChecklist = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [],
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.extractChecklist = mockExtractChecklist;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト抽出ボタンをクリック
      const extractButton = screen.getByRole('button', {
        name: /チェックリスト抽出/i,
      });
      await userEvent.click(extractButton);

      // モーダルが開いたことを確認
      await waitFor(() => {
        expect(
          screen.getByText('チェックリスト抽出対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 一般ドキュメントを選択
      const generalRadio = screen.getByRole('radio', {
        name: /一般ドキュメント（新規チェックリスト作成）/,
      });
      await act(async () => {
        fireEvent.click(generalRadio);
      });

      // ファイル選択ボタンをクリック
      const fileSelectButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/i,
      });
      await userEvent.click(fileSelectButton);

      // ファイルが追加されたことを確認
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // 画像モード（統合）に切り替え
      const imageRadioLabel = screen.getByText(/^画像$/);
      await userEvent.click(imageRadioLabel);

      // 統合画像モードに切り替え
      const mergedRadio = screen.getByLabelText(/統合画像/);
      await userEvent.click(mergedRadio);

      // チェックリスト作成要件を入力
      const requirementInput = screen.getByLabelText('チェックリスト作成要件');
      await userEvent.type(requirementInput, 'テスト要件');

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /チェックリスト抽出/i });
      await userEvent.click(submitButton);

      // PDF読み込みが呼ばれたことを確認
      await waitFor(() => {
        expect(mockReadFile).toHaveBeenCalled();
      });

      // PDF→画像変換が呼ばれたことを確認
      await waitFor(() => {
        expect(mockConvertPdfBytesToImages).toHaveBeenCalledWith(
          expect.any(Uint8Array),
          { scale: 2.0 },
        );
      });

      // combineImagesも呼ばれたことを確認
      await waitFor(() => {
        expect(mockCombineImages).toHaveBeenCalledWith([
          'data:image/png;base64,mock-image-1',
          'data:image/png;base64,mock-image-2',
        ]);
      });

      // extractChecklistが正しい引数で呼ばれることを確認
      await waitFor(() => {
        expect(mockExtractChecklist).toHaveBeenCalledWith({
          reviewHistoryId: 'review-1',
          files: expect.arrayContaining([
            expect.objectContaining({
              name: 'test.pdf',
              path: '/path/to/test.pdf',
              processMode: 'image',
              imageMode: 'merged',
              imageData: ['data:image/png;base64,mock-combined-image'],
            }),
          ]),
          documentType: 'general',
          checklistRequirements: 'テスト要件',
        });
      });

      // モックをリストア
      mockConvertPdfBytesToImages.mockRestore();
      mockCombineImages.mockRestore();
    });
  });
});
