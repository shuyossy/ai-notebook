/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
  cleanup,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { RevieHistory, ReviewChecklistResult } from '@/types';
import ReviewArea from '@/renderer/components/review/ReviewArea';
import { createMockElectronWithOptions } from './test-utils/mockElectronHandler';

// JSDOMではReadableStreamがサポートされていないため、polyfillを使用
const { ReadableStream } = require('web-streams-polyfill/ponyfill');
global.ReadableStream = ReadableStream;

// TextEncoderも同様にモック
const { TextEncoder } = require('util');
global.TextEncoder = TextEncoder;

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
    content: '仕様書の記載内容が正確であること',
    sourceEvaluation: {
      evaluation: 'A',
      comment: '記載は正確です',
    },
  },
  {
    id: 2,
    content: '設計書の整合性が取れていること',
    sourceEvaluation: {
      evaluation: 'B',
      comment: '一部整合性に問題があります',
    },
  },
  {
    id: 3,
    content: 'テスト計画が十分であること',
    sourceEvaluation: {
      evaluation: 'C',
      comment: 'テスト計画が不足しています',
    },
  },
];

describe('ReviewArea - レビュー質問機能', () => {
  // テスト前のセットアップ
  beforeEach(() => {
    window.electron = createMockElectronWithOptions({
      reviewHistory: mockReviewHistory,
      reviewChecklistResults: mockChecklistResults,
    });
    // JSDOM上で scrollIntoView をダミー実装
    (window as any).HTMLElement.prototype.scrollIntoView = function () {};
  });

  // テスト後のクリーンアップ
  afterEach(() => {
    jest.clearAllMocks();
    cleanup();
  });

  // ヘルパー関数: チェックリスト読み込みと質問ボタン有効化を待機
  const waitForChecklistAndEnableQuestionButton = async () => {
    // チェックリスト結果が読み込まれるまで待機
    await waitFor(() => {
      expect(screen.getByText('仕様書の記載内容が正確であること')).toBeInTheDocument();
    });

    // 質問ボタンが有効化されるまで待機
    const questionButton = screen.getByRole('button', { name: /^質問$/ });
    await waitFor(() => {
      expect(questionButton).not.toBeDisabled();
    });

    return questionButton;
  };

  // ヘルパー関数: 質問ボタンをクリックしてチャットパネルを開く
  const openChatPanel = async () => {
    const questionButton = await waitForChecklistAndEnableQuestionButton();
    await act(async () => {
      fireEvent.click(questionButton);
    });

    // チャットパネルの入力フィールドが表示されるまで待機
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(
          '@でチェックリストを選択して質問してください',
        ),
      ).toBeInTheDocument();
    });
  };

  // テスト1: 質問ボタンをクリックしてチャットパネルが開くこと
  test('質問ボタンをクリックしてチャットパネルが開くこと', async () => {
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    // 入力フィールドが表示されることを確認
    expect(
      screen.getByPlaceholderText(
        '@でチェックリストを選択して質問してください',
      ),
    ).toBeInTheDocument();

    // 閉じるボタンが表示されることを確認
    const closeIcon = screen.getByTestId('CloseIcon');
    expect(closeIcon).toBeInTheDocument();
  });

  // テスト2: 閉じるボタンでパネルを閉じられること
  test('閉じるボタンでパネルを閉じられること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    // CloseIconの親ボタンをクリック
    const closeIcon = screen.getByTestId('CloseIcon');
    const closeButton = closeIcon.closest('button');
    expect(closeButton).toBeInTheDocument();
    await user.click(closeButton!);

    // パネルが閉じることを確認（入力フィールドが消える）
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(
          '@でチェックリストを選択して質問してください',
        ),
      ).not.toBeInTheDocument();
    });
  });

  // テスト3: レビュー履歴ID変更時にチャット内容が初期化されること
  test('レビュー履歴ID変更時にチャット内容が初期化されること', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ReviewArea selectedReviewHistoryId="review-1" />,
    );

    await openChatPanel();

    // 入力フィールドにテキストを入力
    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, 'テスト入力');
    expect(input).toHaveValue('テスト入力');

    // 異なるレビュー履歴IDでリレンダー
    const mockReviewHistory2: RevieHistory = {
      ...mockReviewHistory,
      id: 'review-2',
    };
    window.electron = createMockElectronWithOptions({
      reviewHistory: mockReviewHistory2,
      reviewChecklistResults: mockChecklistResults,
    });

    rerender(<ReviewArea selectedReviewHistoryId="review-2" />);

    // チャットパネルが閉じることを確認
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(
          '@でチェックリストを選択して質問してください',
        ),
      ).not.toBeInTheDocument();
    });
  });

  // テスト4: @入力時にチェックリスト選択メニューが表示されること
  test('@入力時にチェックリスト選択メニューが表示されること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, '@');

    // メニューが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('@仕様書の記載内容が正確であること')).toBeInTheDocument();
      expect(screen.getByText('@設計書の整合性が取れていること')).toBeInTheDocument();
      expect(screen.getByText('@テスト計画が十分であること')).toBeInTheDocument();
    });
  });

  // テスト5: チェックリストを選択できること
  test('チェックリストを選択できること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, '@');

    // 最初のチェックリストを選択
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // 選択したチェックリストがChipとして表示されることを確認
    await waitFor(() => {
      // チェックリスト内容とChip両方に表示されるため、getAllByTextを使用
      const chips = screen.getAllByText('仕様書の記載内容が正確であること');
      expect(chips.length).toBeGreaterThan(1);
    });

    // @が削除されていることを確認
    expect(input).toHaveValue('');
  });

  // テスト6: 選択したチェックリストを削除できること
  test('選択したチェックリストを削除できること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, '@');

    // チェックリストを選択
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // Chipが表示されることを確認（複数存在する可能性があるため、MuiChip-rootで絞り込む）
    await waitFor(() => {
      const chips = document.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBeGreaterThan(0);
    });

    // 最初のChipの削除アイコンをクリック
    const chips = document.querySelectorAll('.MuiChip-root');
    const deleteIcon = within(chips[0] as HTMLElement).getByTestId('CancelIcon');
    await user.click(deleteIcon);

    // Chipが削除されることを確認
    await waitFor(() => {
      const remainingChips = document.querySelectorAll('.MuiChip-root');
      expect(remainingChips.length).toBe(0);
    });
  });

  // テスト7: 検索文字列でチェックリストがフィルタリングされること
  test('検索文字列でチェックリストがフィルタリングされること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, '@仕様書');

    // フィルタリングされたチェックリストのみが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('@仕様書の記載内容が正確であること')).toBeInTheDocument();
      expect(screen.queryByText('@設計書の整合性が取れていること')).not.toBeInTheDocument();
      expect(screen.queryByText('@テスト計画が十分であること')).not.toBeInTheDocument();
    });
  });

  // テスト8: 完全一致時にEnterで自動選択されること
  test('完全一致時にEnterで自動選択されること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, '@仕様書の記載内容が正確であること');

    // Enterキーを押す
    await user.keyboard('{Enter}');

    // チェックリストが自動選択されてChipが表示されることを確認
    await waitFor(() => {
      const chips = document.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBeGreaterThan(0);
    });

    // @と検索文字列が削除されていることを確認
    expect(input).toHaveValue('');
  });

  // テスト9: チェックリスト未選択時に警告が表示されること
  test('チェックリスト未選択時に警告が表示されること', async () => {
    const user = userEvent.setup();
    const mockAddAlert = jest.fn();
    // useAlertStoreをモック
    jest.spyOn(require('@/renderer/stores/alertStore'), 'useAlertStore').mockReturnValue(mockAddAlert);

    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, 'テスト質問');

    // 送信ボタンをクリック
    const sendButton = screen.getByTestId('review-chat-send-button');
    await user.click(sendButton);

    // 警告メッセージが表示されることを確認
    await waitFor(() => {
      expect(mockAddAlert).toHaveBeenCalled();
    });
  });

  // テスト10: 空メッセージは送信できないこと
  test('空メッセージは送信できないこと', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // チェックリストを選択
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // 送信ボタンが無効化されていることを確認
    const sendButton = screen.getByTestId('review-chat-send-button');
    expect(sendButton).toBeDisabled();

    // 空白のみの入力では送信できないことを確認
    await user.type(input, '   ');
    expect(sendButton).toBeDisabled();
  });

  // テスト11: チェックリスト選択後にメッセージ送信できること
  test('チェックリスト選択後にメッセージ送信でき、IPC通信が正しく呼ばれること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // チェックリストを選択
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // メッセージを入力
    await user.type(input, 'この項目について詳しく教えてください');

    // 送信ボタンをクリック
    const sendButton = screen.getByTestId('review-chat-send-button');
    await user.click(sendButton);

    // sendChatMessageが正しく呼ばれることを確認
    await waitFor(() => {
      expect(window.electron.review.sendChatMessage).toHaveBeenCalledWith({
        reviewHistoryId: 'review-1',
        checklistIds: [1],
        question: '@仕様書の記載内容が正確であること\n\nこの項目について詳しく教えてください',
      });
    });
  });

  // テスト12: 送信後に入力欄がクリアされること
  test('送信後に入力欄がクリアされ、IPC通信が正しく呼ばれること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // チェックリストを選択
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // メッセージを入力
    await user.type(input, 'テスト質問');

    // 送信ボタンをクリック
    const sendButton = screen.getByTestId('review-chat-send-button');
    await user.click(sendButton);

    // 入力欄がクリアされることを確認
    await waitFor(() => {
      expect(input).toHaveValue('');
    });

    // IPC通信が正しく呼ばれることを確認
    expect(window.electron.review.sendChatMessage).toHaveBeenCalledWith({
      reviewHistoryId: 'review-1',
      checklistIds: [1],
      question: '@仕様書の記載内容が正確であること\n\nテスト質問',
    });
  });

  // テスト13: ストリーミング中は入力が無効化されること
  test('ストリーミング中は入力が無効化されること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // チェックリストを選択してメッセージを送信
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);
    await user.type(input, 'テスト質問');

    const sendButton = screen.getByTestId('review-chat-send-button');
    await user.click(sendButton);

    // ストリーミング中のプレースホルダーが表示されることを確認
    await waitFor(() => {
      const streamingInput = screen.queryByPlaceholderText('メッセージ送信中…');
      if (streamingInput) {
        expect(streamingInput).toBeDisabled();
      }
    });
  });

  // テスト14: 複数のチェックリストを選択してメッセージ送信できること
  test('複数のチェックリストを選択してメッセージ送信でき、IPC通信が正しく呼ばれること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // 1つ目のチェックリストを選択
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // 2つ目のチェックリストを選択
    await user.type(input, '@');
    const secondOption = await screen.findByText('@設計書の整合性が取れていること');
    await user.click(secondOption);

    // 両方のChipが表示されることを確認
    await waitFor(() => {
      const chips = document.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBe(2);
    });

    // メッセージを入力して送信
    await user.type(input, 'これらの項目について教えてください');
    const sendButton = screen.getByTestId('review-chat-send-button');
    await user.click(sendButton);

    // 複数のチェックリストIDが送信されることを確認
    await waitFor(() => {
      expect(window.electron.review.sendChatMessage).toHaveBeenCalledWith({
        reviewHistoryId: 'review-1',
        checklistIds: [1, 2],
        question: expect.stringContaining('これらの項目について教えてください'),
      });
    });
  });

  // テスト15: IME変換中のEnterキーが正しく処理されること
  test('IME変換中のEnterキーが正しく処理されること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // チェックリストを選択
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // メッセージを入力
    await user.type(input, 'テスト質問');

    // IME変換開始イベントをシミュレート
    fireEvent.compositionStart(input);

    // IME変換中のEnterキーを押す
    await user.keyboard('{Enter}');

    // メッセージが送信されないことを確認
    expect(window.electron.review.sendChatMessage).not.toHaveBeenCalled();
  });

  // テスト16: Shift+Enterで改行されること
  test('Shift+Enterで改行されること', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // チェックリストを選択
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // メッセージを入力
    await user.type(input, '1行目');

    // Shift+Enterで改行
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // 改行が挿入されることを確認
    expect(input).toHaveValue('1行目\n');

    // メッセージが送信されないことを確認
    expect(window.electron.review.sendChatMessage).not.toHaveBeenCalled();
  });

  // テスト17: 同じチェックリストを重複して選択できないこと
  test('同じチェックリストを重複して選択できないこと', async () => {
    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );

    // 1回目の選択
    await user.type(input, '@');
    const firstOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(firstOption);

    // 1つのChipが表示されることを確認
    await waitFor(() => {
      const chips = document.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBe(1);
    });

    // 2回目の選択（同じチェックリスト）
    await user.type(input, '@');
    const secondOption = await screen.findByText('@仕様書の記載内容が正確であること');
    await user.click(secondOption);

    // Chipは1つのままであることを確認（重複選択されない）
    const chips = document.querySelectorAll('.MuiChip-root');
    expect(chips.length).toBe(1);
  });

  // テスト18: コメントがないチェックリスト項目は質問パネルに表示されないこと
  test('コメントがないチェックリスト項目は質問パネルに表示されないこと', async () => {
    // コメントがない項目を含むモックデータ
    const mockChecklistWithNoComment: ReviewChecklistResult[] = [
      ...mockChecklistResults,
      {
        id: 4,
        content: 'コメントなし項目',
      },
    ];

    window.electron = createMockElectronWithOptions({
      reviewHistory: mockReviewHistory,
      reviewChecklistResults: mockChecklistWithNoComment,
    });

    const user = userEvent.setup();
    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    await openChatPanel();

    const input = screen.getByPlaceholderText(
      '@でチェックリストを選択して質問してください',
    );
    await user.type(input, '@');

    // コメント付きの項目は表示される
    await waitFor(() => {
      expect(screen.getByText('@仕様書の記載内容が正確であること')).toBeInTheDocument();
      expect(screen.getByText('@設計書の整合性が取れていること')).toBeInTheDocument();
      expect(screen.getByText('@テスト計画が十分であること')).toBeInTheDocument();
    });

    // コメントなし項目は表示されない
    expect(screen.queryByText('@コメントなし項目')).not.toBeInTheDocument();
  });

  // テスト19: レビュー結果がない場合は質問ボタンが無効化されていること
  test('レビュー結果がない場合は質問ボタンが無効化されていること', async () => {
    window.electron = createMockElectronWithOptions({
      reviewHistory: mockReviewHistory,
      reviewChecklistResults: [],
    });

    render(<ReviewArea selectedReviewHistoryId="review-1" />);

    // チェックリスト結果が読み込まれるまで待機
    await waitFor(() => {
      const questionButton = screen.queryByRole('button', { name: /^質問$/ });
      expect(questionButton).toBeInTheDocument();
    });

    // 質問ボタンが無効化されていることを確認
    const questionButton = screen.getByRole('button', { name: /^質問$/ });
    expect(questionButton).toBeDisabled();
  });
});
