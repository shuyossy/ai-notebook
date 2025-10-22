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
  },
];

describe('ReviewArea - レビュー実行', () => {
  beforeEach(() => {
    window.electron = createMockElectronWithOptions({
      reviewHistory: mockReviewHistory,
      reviewChecklistResults: mockChecklistResults,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ヘルパー関数: チェックリスト読み込みとボタン有効化を待機
  const waitForChecklistAndEnableButton = async (buttonName: RegExp) => {
    // チェックリスト結果が読み込まれるまで待機
    await waitFor(() => {
      expect(screen.getByText('チェック項目1')).toBeInTheDocument();
    });

    // ボタンが有効化されるまで待機
    const button = screen.getByRole('button', { name: buttonName });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    return button;
  };

  describe('レビュー実行用モーダル', () => {
    it('レビュー実行ボタンをクリックするとモーダルが開くこと', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(
        /^レビュー実行$/,
      );

      // ボタンをクリック
      await act(async () => {
        fireEvent.click(reviewButton);
      });

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
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
        reviewChecklistResults: mockChecklistResults,
      });
      window.electron.fs.showOpenDialog = mockShowOpenDialog;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/);

      // ボタンをクリック
      fireEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(mockShowOpenDialog).toHaveBeenCalledWith({
          title: 'ドキュメントファイルを選択',
          filters: [
            {
              name: 'ドキュメントファイル',
              extensions: [
                'pdf',
                'doc',
                'docx',
                'xls',
                'xlsx',
                'ppt',
                'pptx',
                'txt',
                'csv',
              ],
            },
          ],
          properties: ['openFile', 'multiSelections'],
        });
      });
    });

    it('評価項目が空の場合にエラーメッセージが表示されること', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/);

      // ボタンをクリック
      await act(async () => {
        fireEvent.click(reviewButton);
      });

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 評価設定のアコーディオンを見つけて展開
      const accordionButton2 = await waitFor(() =>
        screen.getByText('評定項目設定'),
      );

      fireEvent.click(accordionButton2);

      // アコーディオンが展開されて内容が表示されるまで待機
      await waitFor(
        () => {
          expect(screen.getByText('基準を完全に満たしている')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // 評価項目追加ボタンが表示されるまで待機
      const addButton = await waitFor(
        () => screen.getByRole('button', { name: /評定項目を追加/ }),
        { timeout: 3000 },
      );

      fireEvent.click(addButton);

      // 編集フォームが表示されることを確認
      await waitFor(() => {
        expect(screen.getByLabelText(/評定ラベル/)).toBeInTheDocument();
      });

      // 空のまま追加ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /追加/ });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      // エラーメッセージがalertStoreに追加されることを確認
      await waitFor(() => {
        const alerts = alertStore.getState().alerts;
        const hasError = alerts.some((alert: AlertMessage) =>
          alert.message.includes('すべての項目を入力してください'),
        );
        expect(hasError).toBe(true);
      });
    });

    it('モーダルをキャンセルできること', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/);

      // ボタンをクリック
      fireEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(
          screen.queryByText('レビュー対象ファイルのアップロード'),
        ).not.toBeInTheDocument();
      });
    });

    it('ファイル未選択時は送信ボタンが無効化されること', async () => {
      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/);

      // ボタンをクリック
      fireEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/,
      });
      expect(submitButton).toBeDisabled();
    });

    it('チェックリスト未抽出時はレビュー実行ボタンが無効化されること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: [], // チェックリストが空
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        const reviewButton = screen.getByRole('button', {
          name: /レビュー実行/,
        });
        expect(reviewButton).toBeDisabled();
      });
    });
  });

  describe('レビュー実行処理', () => {
    it('追加指示を設定してレビューを実行した場合、IPC通信に正しく渡されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 追加指示を入力
      const additionalInstructionsInput = screen.getByLabelText(/追加指示/);
      await act(async () => {
        fireEvent.change(additionalInstructionsInput, {
          target: { value: '特に注意して確認してください' },
        });
      });

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
      await userEvent.click(submitButton);

      // window.electron.review.executeが正しい追加指示で呼ばれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            additionalInstructions: '特に注意して確認してください',
          }),
        );
      });
    });

    it('コメントフォーマットを設定してレビューを実行した場合、IPC通信に正しく渡されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // コメントフォーマットを編集
      const commentFormatInput = screen.getByLabelText(/コメントフォーマット/);
      await act(async () => {
        fireEvent.change(commentFormatInput, {
          target: { value: 'カスタムコメントフォーマット:\n{指摘内容}' },
        });
      });

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
      await userEvent.click(submitButton);

      // window.electron.review.executeが正しいコメントフォーマットで呼ばれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            commentFormat: 'カスタムコメントフォーマット:\n{指摘内容}',
          }),
        );
      });
    });

    it('評価項目を編集してレビューを実行した場合、IPC通信に正しく渡されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 評価設定のアコーディオンを展開
      const accordionButton = await waitFor(() =>
        screen.getByText('評定項目設定'),
      );
      fireEvent.click(accordionButton);

      // アコーディオンが展開されて内容が表示されるまで待機
      await waitFor(
        () => {
          expect(screen.getByText('基準を完全に満たしている')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // 既存の評価項目「A」の編集ボタンをクリック
      // 評価項目は順番に表示されているので、最初の編集ボタンが「A」の編集ボタン
      const editButtons = screen.getAllByRole('button', { name: '' }).filter(
        (button) => button.querySelector('svg[data-testid="EditIcon"]'),
      );

      await act(async () => {
        fireEvent.click(editButtons[0]);
      });

      // 編集フォームが表示されることを確認
      await waitFor(() => {
        expect(screen.getByLabelText(/評定ラベル/)).toBeInTheDocument();
      });

      // ラベルを「A+」に、説明を「基準を大きく上回っている」に変更
      const labelInput = screen.getByLabelText(/評定ラベル/);
      const descriptionInput = screen.getByLabelText(/評定説明/);

      await act(async () => {
        fireEvent.change(labelInput, { target: { value: 'A+' } });
        fireEvent.change(descriptionInput, {
          target: { value: '基準を大きく上回っている' },
        });
      });

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /保存/ });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      // 編集された評価項目が表示されることを確認
      await waitFor(() => {
        expect(screen.getByText('基準を大きく上回っている')).toBeInTheDocument();
      });

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
      await userEvent.click(submitButton);

      // window.electron.review.executeが編集後の評価設定で呼ばれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            evaluationSettings: expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ label: 'A+', description: '基準を大きく上回っている' }),
                expect.objectContaining({ label: 'B' }),
                expect.objectContaining({ label: 'C' }),
                expect.objectContaining({ label: '–' }),
              ]),
            }),
          }),
        );
      });
    });

    it('評価項目を削除してレビューを実行した場合、IPC通信に正しく渡されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 評価設定のアコーディオンを展開
      const accordionButton = await waitFor(() =>
        screen.getByText('評定項目設定'),
      );
      fireEvent.click(accordionButton);

      // アコーディオンが展開されて内容が表示されるまで待機
      await waitFor(
        () => {
          expect(screen.getByText('基準を完全に満たしている')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // 既存の評価項目「C」の削除ボタンをクリック
      // 評価項目は順番に表示されているので、3番目の削除ボタンが「C」の削除ボタン
      const deleteButtons = screen.getAllByRole('button', { name: '' }).filter(
        (button) => button.querySelector('svg[data-testid="DeleteIcon"]'),
      );

      await act(async () => {
        fireEvent.click(deleteButtons[2]); // 「C」の削除ボタン
      });

      // 「C」の項目が削除されたことを確認（「基準を満たしていない」が表示されなくなる）
      await waitFor(() => {
        expect(screen.queryByText('基準を満たしていない')).not.toBeInTheDocument();
      });

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
      await userEvent.click(submitButton);

      // window.electron.review.executeが削除後の評価設定で呼ばれることを確認
      // 「C」が含まれず、A, B, –のみが含まれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            evaluationSettings: expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ label: 'A' }),
                expect.objectContaining({ label: 'B' }),
                expect.objectContaining({ label: '–' }),
              ]),
            }),
          }),
        );

        // 「C」が含まれていないことを確認
        const call = mockExecuteReview.mock.calls[0][0];
        const hasC = call.evaluationSettings.items.some(
          (item: any) => item.label === 'C'
        );
        expect(hasC).toBe(false);
      });
    });

    it('レビュー実行中はローディングインジケータが表示されること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: mockChecklistResults,
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        // LinearProgressが表示されることを確認
        const progress = document.querySelector('.MuiLinearProgress-root');
        expect(progress).toBeInTheDocument();
      });
    });

    it('カスタム評価設定を追加してレビューを実行した場合、IPC通信に正しく渡されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 評価設定のアコーディオンを展開
      const accordionButton = await waitFor(() =>
        screen.getByText('評定項目設定'),
      );
      fireEvent.click(accordionButton);

      // アコーディオンが展開されて内容が表示されるまで待機
      await waitFor(
        () => {
          expect(screen.getByText('基準を完全に満たしている')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // 評価項目追加ボタンをクリック
      const addButton = await waitFor(
        () => screen.getByRole('button', { name: /評定項目を追加/ }),
        { timeout: 3000 },
      );
      await act(async () => {
        fireEvent.click(addButton);
      });

      // 編集フォームが表示されることを確認
      await waitFor(() => {
        expect(screen.getByLabelText(/評定ラベル/)).toBeInTheDocument();
      });

      // 新しい評定項目を入力
      const labelInput = screen.getByLabelText(/評定ラベル/);
      const descriptionInput = screen.getByLabelText(/評定説明/);

      await act(async () => {
        fireEvent.change(labelInput, { target: { value: 'S' } });
        fireEvent.change(descriptionInput, {
          target: { value: '非常に優れている' },
        });
      });

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /追加/ });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      // 新しい評価項目が追加されたことを確認
      await waitFor(() => {
        expect(screen.getByText('非常に優れている')).toBeInTheDocument();
      });

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
      await userEvent.click(submitButton);

      // window.electron.review.executeが正しい評価設定で呼ばれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            evaluationSettings: expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ label: 'S', description: '非常に優れている' }),
                expect.objectContaining({ label: 'A' }),
                expect.objectContaining({ label: 'B' }),
                expect.objectContaining({ label: 'C' }),
                expect.objectContaining({ label: '–' }),
              ]),
            }),
          }),
        );
      });
    });

    it('レビュー実行中はボタンが「キャンセル」に変わること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: mockChecklistResults,
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('キャンセル')).toBeInTheDocument();
      });
    });

    it('ドキュメント量を「大」に設定してレビューを実行した場合、IPC通信に正しく渡されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // ドキュメント量のラジオボタンを値で検索して「大」を選択
      const radioButtons = await screen.findAllByRole('radio');
      const largeRadio = radioButtons.find((radio) =>
        (radio as HTMLInputElement).value === 'large'
      );

      expect(largeRadio).toBeDefined();
      fireEvent.click(largeRadio!);

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
      await userEvent.click(submitButton);

      // window.electron.review.executeがdocumentMode: 'large'で呼ばれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            documentMode: 'large',
          }),
        );
      });
    });

    it('レビュー実行中はチェックリスト抽出ボタンが無効化されること', async () => {
      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: mockChecklistResults,
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        const extractButton = screen.getByRole('button', {
          name: /チェックリスト抽出/,
        });
        expect(extractButton).toBeDisabled();
      });
    });

    it('複数の条件（追加指示、コメントフォーマット、評価設定、ドキュメント量）を設定してレビューを実行した場合、すべてIPC通信に正しく渡されること', async () => {
      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      // 1. 追加指示を入力
      const additionalInstructionsInput = screen.getByLabelText(/追加指示/);
      await act(async () => {
        fireEvent.change(additionalInstructionsInput, {
          target: { value: 'セキュリティ観点でも確認してください' },
        });
      });

      // 2. コメントフォーマットを編集
      const commentFormatInput = screen.getByLabelText(/コメントフォーマット/);
      await act(async () => {
        fireEvent.change(commentFormatInput, {
          target: { value: '【指摘】\n{内容}\n【根拠】\n{理由}' },
        });
      });

      // 3. 評価設定のアコーディオンを展開して評価項目を追加
      const accordionButton = await waitFor(() =>
        screen.getByText('評定項目設定'),
      );
      fireEvent.click(accordionButton);

      await waitFor(
        () => {
          expect(screen.getByText('基準を完全に満たしている')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const addButton = await waitFor(
        () => screen.getByRole('button', { name: /評定項目を追加/ }),
        { timeout: 3000 },
      );
      await act(async () => {
        fireEvent.click(addButton);
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/評定ラベル/)).toBeInTheDocument();
      });

      const labelInput = screen.getByLabelText(/評定ラベル/);
      const descriptionInput = screen.getByLabelText(/評定説明/);

      await act(async () => {
        fireEvent.change(labelInput, { target: { value: 'S' } });
        fireEvent.change(descriptionInput, {
          target: { value: '卓越している' },
        });
      });

      const saveButton = screen.getByRole('button', { name: /追加/ });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(screen.getByText('卓越している')).toBeInTheDocument();
      });

      // 4. ドキュメント量を「大」に設定
      const radioButtons = await screen.findAllByRole('radio');
      const largeRadio = radioButtons.find((radio) =>
        (radio as HTMLInputElement).value === 'large'
      );

      expect(largeRadio).toBeDefined();
      fireEvent.click(largeRadio!);

      // ファイル選択
      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
      await userEvent.click(submitButton);

      // すべてのパラメータが正しく渡されることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            additionalInstructions: 'セキュリティ観点でも確認してください',
            commentFormat: '【指摘】\n{内容}\n【根拠】\n{理由}',
            evaluationSettings: expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ label: 'S', description: '卓越している' }),
                expect.objectContaining({ label: 'A' }),
                expect.objectContaining({ label: 'B' }),
                expect.objectContaining({ label: 'C' }),
                expect.objectContaining({ label: '–' }),
              ]),
            }),
            documentMode: 'large',
          }),
        );
      });
    });

    it('キャンセルボタンをクリックするとabortExecuteReviewが呼ばれること', async () => {
      const mockAbortExecute = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: {
          ...mockReviewHistory,
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: mockChecklistResults,
      });
      window.electron.review.abortExecute = mockAbortExecute;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('キャンセル')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(mockAbortExecute).toHaveBeenCalledWith('review-1');
      });
    });

    it('Officeファイルを画像化する際にOffice→PDF→画像変換が実行されること', async () => {
      const mockConvertPdfBytesToImages = jest
        .spyOn(pdfUtils, 'convertPdfBytesToImages')
        .mockResolvedValue([
          'data:image/png;base64,mock-image-1',
          'data:image/png;base64,mock-image-2',
        ]);

      const mockConvertOfficeToPdf = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.xlsx'],
          canceled: false,
        },
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.convertOfficeToPdf = mockConvertOfficeToPdf;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('レビュー実行')).toBeInTheDocument();
      });

      const reviewButton = screen.getByRole('button', {
        name: /レビュー実行/,
      });
      await act(async () => {
        fireEvent.click(reviewButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.xlsx')).toBeInTheDocument();
      });

      // 画像モードに切り替え
      const imageRadioLabel = screen.getAllByText(/^画像$/)[0];
      await act(async () => {
        fireEvent.click(imageRadioLabel);
      });

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/,
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

      // window.electron.review.executeが正しく呼ばれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            files: expect.arrayContaining([
              expect.objectContaining({
                name: 'test.xlsx',
                imageData: expect.any(Array),
              }),
            ]),
            additionalInstructions: '',
            commentFormat: expect.stringContaining('評価理由・根拠'),
            evaluationSettings: expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ label: 'A' }),
                expect.objectContaining({ label: 'B' }),
                expect.objectContaining({ label: 'C' }),
                expect.objectContaining({ label: '–' }),
              ]),
            }),
            documentMode: 'small',
          }),
        );
      });

      mockConvertPdfBytesToImages.mockRestore();
    });

    it('PDFファイルを画像化する際にPDF→画像変換が実行されること', async () => {
      const mockConvertPdfBytesToImages = jest
        .spyOn(pdfUtils, 'convertPdfBytesToImages')
        .mockResolvedValue([
          'data:image/png;base64,mock-image-1',
          'data:image/png;base64,mock-image-2',
        ]);

      const mockReadFile = jest.fn().mockResolvedValue({
        success: true as const,
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      });

      const mockShowOpenDialog = jest.fn().mockResolvedValue({
        success: true as const,
        data: {
          filePaths: ['/path/to/test.pdf'],
          canceled: false,
        },
      });

      const mockExecuteReview = jest.fn().mockResolvedValue({
        success: true,
      });

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResults,
      }) as any;
      window.electron.fs.showOpenDialog = mockShowOpenDialog;
      window.electron.fs.readFile = mockReadFile;
      window.electron.review.execute = mockExecuteReview;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      // チェックリスト読み込みとボタン有効化を待機
      const reviewButton = await waitForChecklistAndEnableButton(/レビュー実行/i);

      // ボタンをクリック
      await userEvent.click(reviewButton);

      // モーダルが開くことを確認
      await waitFor(() => {
        expect(
          screen.getByText('レビュー対象ファイルのアップロード'),
        ).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', {
        name: /ファイル選択ダイアログ/,
      });
      await act(async () => {
        fireEvent.click(uploadButton);
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      // 画像化モード（ページ毎）に切り替え
      const imageRadioLabel = screen.getByText(/^画像$/);
      await userEvent.click(imageRadioLabel);

      // モーダルの送信ボタンをクリック
      const submitButton = screen.getByRole('button', {
        name: /レビュー実行/i,
      });
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

      // window.electron.review.executeが正しく呼ばれることを確認
      await waitFor(() => {
        expect(mockExecuteReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reviewHistoryId: 'review-1',
            files: expect.arrayContaining([
              expect.objectContaining({
                name: 'test.pdf',
                imageData: expect.any(Array),
              }),
            ]),
            additionalInstructions: '',
            commentFormat: expect.stringContaining('評価理由・根拠'),
            evaluationSettings: expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ label: 'A' }),
                expect.objectContaining({ label: 'B' }),
                expect.objectContaining({ label: 'C' }),
                expect.objectContaining({ label: '–' }),
              ]),
            }),
            documentMode: 'small',
          }),
        );
      });

      mockConvertPdfBytesToImages.mockRestore();
    });
  });

  describe('レビュー実行結果表示', () => {
    it('レビュー結果がチェックリストセクションに表示されること', async () => {
      const mockChecklistResultsWithReview: ReviewChecklistResult[] = [
        {
          id: 1,
          content: 'チェック項目1',
          sourceEvaluation: {
            evaluation: 'A',
            comment: '基準を満たしています',
          },
        },
        {
          id: 2,
          content: 'チェック項目2',
          sourceEvaluation: {
            evaluation: 'B',
            comment: '改善の余地があります',
          },
        },
      ];

      window.electron = createMockElectronWithOptions({
        reviewHistory: mockReviewHistory,
        reviewChecklistResults: mockChecklistResultsWithReview,
      });

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await waitFor(() => {
        expect(screen.getByText('基準を満たしています')).toBeInTheDocument();
        expect(screen.getByText('改善の余地があります')).toBeInTheDocument();
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

  describe('レビュー実行処理のポーリングとイベント受信', () => {
    it('レビュー実行中は5秒ごとにチェックリスト結果がポーリングされること', async () => {
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
          processingStatus: 'reviewing',
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
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: mockChecklistResults,
      });

      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

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

    it('レビュー完了イベント（成功）を受信したら、結果を再取得してポーリングを停止すること', async () => {
      jest.useFakeTimers();

      let eventCallback: ((event: any) => void) | null = null;
      const mockSubscribe = jest.fn((eventType: string, callback: any) => {
        if (eventType === 'review-execute-finished') {
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
          processingStatus: 'reviewing',
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
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: [],
      });

      window.electron.pushApi.subscribe = mockSubscribe as any;
      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await act(async () => {
        await Promise.resolve();
      });

      // イベントコールバックが設定されていることを確認
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
        expect(eventCallback).not.toBeNull();
      });

      const callCountBeforeEvent = mockGetHistoryDetail.mock.calls.length;

      // レビュー完了イベントを発火
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
          alert.message.includes('レビューが完了しました'),
        );
        expect(hasSuccess).toBe(true);
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

    it('レビュー完了イベント（失敗）を受信したら、エラーメッセージを表示してポーリングを停止すること', async () => {
      jest.useFakeTimers();

      let eventCallback: ((event: any) => void) | null = null;
      const mockSubscribe = jest.fn((eventType: string, callback: any) => {
        if (eventType === 'review-execute-finished') {
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
          processingStatus: 'reviewing',
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
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: [],
      });

      window.electron.pushApi.subscribe = mockSubscribe as any;
      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await act(async () => {
        await Promise.resolve();
      });

      // イベントコールバックが設定されるまで待つ
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
        expect(eventCallback).not.toBeNull();
      });

      // レビュー失敗イベントを発火
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
            alert.message.includes('レビューに失敗しました') &&
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

    it('レビュー完了イベント（キャンセル）を受信したら、キャンセルメッセージを表示してポーリングを停止すること', async () => {
      jest.useFakeTimers();

      let eventCallback: ((event: any) => void) | null = null;
      const mockSubscribe = jest.fn((eventType: string, callback: any) => {
        if (eventType === 'review-execute-finished') {
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
          processingStatus: 'reviewing',
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
          processingStatus: 'reviewing',
        },
        reviewChecklistResults: [],
      });

      window.electron.pushApi.subscribe = mockSubscribe as any;
      window.electron.review.getHistoryDetail = mockGetHistoryDetail as any;
      window.electron.review.getHistoryById = mockGetHistoryById as any;
      window.electron.review.getHistoryInstruction =
        mockGetHistoryInstruction as any;

      render(<ReviewArea selectedReviewHistoryId="review-1" />);

      await act(async () => {
        await Promise.resolve();
      });

      // イベントコールバックが設定されるまで待つ
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
        expect(eventCallback).not.toBeNull();
      });

      // レビューキャンセルイベントを発火
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
          alert.message.includes('レビュー実行をキャンセルしました'),
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

    it('ポーリング中にチェックリスト結果が更新されること', async () => {
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
          processingStatus: 'reviewing',
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
          processingStatus: 'reviewing',
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
});
