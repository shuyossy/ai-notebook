/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { v4 as uuidv4 } from 'uuid';

import Sidebar from '@/renderer/components/sidebar/Sidebar';
import type { ChatRoom, ProcessStatus } from '@/types';
import type { Source } from '@/types';
import { StoreSchema as Settings } from '@/adapter/db/electron-store/store';
import { createMockElectronWithOptions } from '@/__tests__/renderer/test-utils/mockElectronHandler';
import ChatRoomList from '@/renderer/components/chat/ChatRoomList';
import ReviewHistoryList from '@/renderer/components/review/ReviewHistoryList';
import { ROUTES } from '@/types';

// uuidv4をモック化
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

// テスト用のモックデータ
const mockChatRooms: ChatRoom[] = [
  {
    id: '1',
    resourceId: 'resource-1',
    title: 'Chat Room 1',
    createdAt: new Date('2025-05-01T12:00:00.000Z'),
    updatedAt: new Date('2025-05-01T12:00:00.000Z'),
  },
  {
    id: '2',
    resourceId: 'resource-2',
    title: 'Chat Room 2',
    createdAt: new Date('2025-05-02T12:00:00.000Z'),
    updatedAt: new Date('2025-05-02T12:00:00.000Z'),
  },
];

// ソースのモックデータ
const mockSources: Source[] = [
  {
    id: 1,
    path: '/test/source1.md',
    title: 'Source 1',
    status: 'completed' as ProcessStatus,
    isEnabled: true,
    error: null,
    createdAt: '2025-05-01T12:00:00.000Z',
    updatedAt: '2025-05-01T12:00:00.000Z',
    summary: 'Test summary 1',
  },
  {
    id: 2,
    path: '/test/source2.md',
    title: 'Source 2',
    status: 'completed' as ProcessStatus,
    isEnabled: true,
    error: null,
    createdAt: '2025-05-02T12:00:00.000Z',
    updatedAt: '2025-05-02T12:00:00.000Z',
    summary: 'Test summary 2',
  },
  {
    id: 3,
    path: '/test/source3.md',
    title: 'Source 3',
    status: 'failed' as ProcessStatus,
    isEnabled: false,
    error: 'Processing error',
    createdAt: '2025-05-03T12:00:00.000Z',
    updatedAt: '2025-05-03T12:00:00.000Z',
    summary: 'Test summary 3',
  },
];

describe('Sidebar Component', () => {
  // テスト前のセットアップ
  beforeEach(() => {
    // Electronグローバルオブジェクトをモック化
    window.electron = createMockElectronWithOptions({
      chatRooms: mockChatRooms,
      sources: mockSources,
    });

    // uuidv4のモックをリセット
    (uuidv4 as jest.Mock).mockReset();
    (uuidv4 as jest.Mock).mockReturnValue('new-room-id');
  });

  // テスト後のクリーンアップ
  afterEach(() => {
    jest.clearAllMocks();
  });

  // 共通のプロップス
  const defaultProps = {
    onRoomSelect: jest.fn(),
    onReloadSources: jest.fn(),
  };

  const renderAtPath = (initialPath: string, selectedRoomId: string | null = null) => {
    render(
      // MemoryRouter でテスト用の履歴を用意
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar
          onReloadSources={defaultProps.onReloadSources}
        >
          <Routes>
            <Route
              path={ROUTES.CHAT}
              element={
                <ChatRoomList
                  selectedRoomId={selectedRoomId}
                  onRoomSelect={defaultProps.onRoomSelect}
                />
              }
            />
            <Route
              path={ROUTES.REVIEW}
              element={
                <ReviewHistoryList
                  selectedReviewHistoryId={selectedRoomId}
                  onReviewHistorySelect={defaultProps.onRoomSelect}
                />
              }
            />
          </Routes>
        </Sidebar>
      </MemoryRouter>,
    );
  };

  // テスト1: 正常にサイドバーとチャットルーム一覧が表示されること
  test('正常にサイドバーとチャットルーム一覧が表示されること', async () => {
    renderAtPath(ROUTES.CHAT);

    // New Chatボタンが表示されることを確認
    expect(screen.getByText('新規チャット')).toBeInTheDocument();

    // チャットルーム一覧が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
      expect(screen.getByText('Chat Room 2')).toBeInTheDocument();
    });

    // フッターのボタンが表示されることを確認
    expect(screen.getByLabelText('ドキュメント一覧')).toBeInTheDocument();
    expect(screen.getByLabelText('設定')).toBeInTheDocument();
  });

  // テスト2: ローディング状態の表示が正しく機能すること
  test('ローディング状態の表示が正しく機能すること', async () => {
    // チャットルーム取得を遅延させる
    window.electron.chat.getRooms = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: mockChatRooms }), 100);
        }),
    );

    renderAtPath(ROUTES.CHAT);

    // ローディング表示を確認
    expect(screen.getByText('チャット履歴取得中')).toBeInTheDocument();

    // チャットルーム一覧が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
      expect(screen.getByText('Chat Room 2')).toBeInTheDocument();
    });

    // ローディング表示が消えていることを確認
    expect(screen.queryByText('チャット履歴取得中')).not.toBeInTheDocument();
  });

  // テスト3: チャットルームが空の場合の表示が正しいこと
  test('チャットルームが空の場合の表示が正しいこと', async () => {
    // 空の配列を返すようにモックを設定
    window.electron.chat.getRooms = jest
      .fn()
      .mockResolvedValue({ success: true, data: [] });

    renderAtPath(ROUTES.CHAT);

    // 空の状態のメッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('チャット履歴がありません')).toBeInTheDocument();
    });
  });

  // テスト4: 新規チャットルームの作成
  test('新規チャットルームの作成', async () => {
    const user = userEvent.setup();
    renderAtPath(ROUTES.CHAT);
    screen.debug(undefined, 100000);

    // チャットルーム一覧が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
      expect(screen.getByText('Chat Room 2')).toBeInTheDocument();
    });

    // New Chatボタンをクリック
    await user.click(screen.getByText('新規チャット'));

    // uuidv4が呼ばれることを確認
    expect(uuidv4).toHaveBeenCalled();

    // onRoomSelectが新しいIDで呼ばれることを確認
    expect(defaultProps.onRoomSelect).toHaveBeenCalledWith('new-room-id');
  });

  // テスト5: チャットルームの選択
  test('チャットルームの選択', async () => {
    const user = userEvent.setup();
    renderAtPath(ROUTES.CHAT);

    // チャットルーム一覧が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
    });

    // チャットルームをクリック
    await user.click(screen.getByText('Chat Room 1'));

    // onRoomSelectが正しいIDで呼ばれることを確認
    expect(defaultProps.onRoomSelect).toHaveBeenCalledWith('1');
  });

  // テスト6: チャットルームの削除
  test('チャットルームの削除の際に正しく指定したチャットルームが削除されること（チャットルームのソート確認も含む）', async () => {
    const user = userEvent.setup();
    renderAtPath(ROUTES.CHAT);

    // チャットルーム一覧が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
    });

    // メニューボタンをクリック
    const menuButtons = screen.getAllByLabelText('more');
    console.log('Menu buttons:', menuButtons);
    await user.click(menuButtons[0]);

    // 削除メニューが表示されることを確認
    expect(screen.getByText('削除')).toBeInTheDocument();

    // 削除メニューをクリック
    await user.click(screen.getByText('削除'));

    // deleteRoomが呼ばれることを確認(id:2のルームがソートされて一番上にくるはず)
    expect(window.electron.chat.deleteRoom).toHaveBeenCalledWith('2');

    // 一覧が再取得されることを確認
    await waitFor(() => {
      expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(2);
    });
  });

  // テスト7: チャットルーム削除時のエラーハンドリング
  test('チャットルーム削除時のエラーハンドリング', async () => {
    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // 削除に失敗するようにモックを設定
    window.electron.chat.deleteRoom = jest.fn().mockResolvedValue({
      success: false,
      error: { message: 'Failed to delete chat room', code: 'DELETE_ERROR' },
    });

    const user = userEvent.setup();
    renderAtPath(ROUTES.CHAT);

    // チャットルーム一覧が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
    });

    // メニューボタンをクリック
    const menuButtons = screen.getAllByLabelText('more');
    await user.click(menuButtons[0]);

    // 削除メニューをクリック
    await user.click(screen.getByText('削除'));

    // エラーログが出力されることを確認
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  // テスト8: フッターのソース一覧モーダル表示
  test('フッターのソース一覧モーダル表示', async () => {
    const user = userEvent.setup();
    renderAtPath(ROUTES.CHAT);

    // ソース一覧ボタンをクリック
    await user.click(screen.getByTestId('document-list-button'));

    // SourceListModalが表示されることを確認
    expect(screen.getByText('登録ドキュメント一覧')).toBeInTheDocument();
  });

  // テスト9: フッターの設定モーダル表示
  test('フッターの設定モーダル表示', async () => {
    const user = userEvent.setup();
    renderAtPath(ROUTES.CHAT);

    // 設定ボタンをクリック
    await user.click(screen.getByTestId('settings-button'));

    // SettingsModalが表示されることを確認
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // テスト10: チャットルーム一覧の初回読み込みエラー時の再試行
  test(
    'チャットルーム一覧の初回読み込みエラー時の再試行',
    async () => {
      // 最初はエラーを返し、2回目は成功するようにモックを設定
      let callCount = 0;
      window.electron.chat.getRooms = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Failed to fetch chat rooms'));
        }
        return Promise.resolve({ success: true, data: mockChatRooms });
      });

      renderAtPath(ROUTES.CHAT);

      // 初回の取得を確認(失敗)
      await waitFor(() => {
        expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(1);
      });

      // 再試行が呼ばれることを確認（ポーリング間隔が5000msなので、5.5秒以内に2回目が呼ばれる）
      await waitFor(
        () => {
          expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(2);
        },
        { timeout: 8000 },
      );

      // チャットルーム一覧が表示されることを確認
      await waitFor(() => {
        expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
        expect(screen.getByText('Chat Room 2')).toBeInTheDocument();
      });
    },
    10000,
  ); // タイムアウトを10秒に設定

  // テスト11: チャットルーム取得時のエラーハンドリング
  test('チャットルーム取得時のエラーハンドリング', async () => {
    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // 取得に失敗するようにモックを設定
    window.electron.chat.getRooms = jest
      .fn()
      .mockRejectedValue(new Error('Failed to fetch chat rooms'));

    renderAtPath(ROUTES.CHAT);

    // 初回表示でローディング中であることを確認
    expect(screen.getByText('チャット履歴取得中')).toBeInTheDocument();

    // エラーログが出力されることを確認
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'チャットルーム読み込みに失敗しました:',
        expect.any(Error),
      );
    });

    // エラー時もローディング状態が維持されることを確認（再試行のため）
    expect(screen.getByText('チャット履歴取得中')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  // テスト12: 設定エラーバッジの初期表示
  test('設定エラーバッジの初期表示', async () => {
    renderAtPath(ROUTES.CHAT);

    // 設定エラーがない場合、バッジは非表示
    const settingsButton = screen.getByTestId('settings-button');
    const settingsButtonParent = settingsButton.closest('.MuiBadge-root');

    await waitFor(() => {
      const errorBadge = settingsButtonParent?.querySelector('.MuiBadge-badge');
      expect(errorBadge).toHaveClass('MuiBadge-invisible');
    });
  });

  // テスト13: 設定保存後のバッジ表示更新
  test('設定保存後のバッジ表示更新', async () => {
    const user = userEvent.setup({ delay: null });
    renderAtPath(ROUTES.CHAT);

    // 設定ボタンをクリックしてモーダルを開く
    await user.click(screen.getByTestId('settings-button'));

    // 設定が不正な状態を作る
    const settingsModal = screen.getByRole('dialog');
    await waitFor(() => {
      expect(settingsModal).toBeInTheDocument();
    });

    // バリデーションエラーを発生させる
    const apiKeyInput = screen.getAllByLabelText('APIキー')[0];
    await waitFor(() => {
      expect(apiKeyInput).toBeEnabled();
    });
    await user.clear(apiKeyInput);

    // エラーバッジが表示されることを確認
    const settingsButton = screen.getByTestId('settings-button');
    const settingsButtonParent = settingsButton.closest('.MuiBadge-root');
    const errorBadge = settingsButtonParent?.querySelector('.MuiBadge-badge');
    await waitFor(() => {
      expect(errorBadge).not.toHaveClass('MuiBadge-invisible');
    });

    // APIキーを入力して有効な状態にする
    await user.type(apiKeyInput, 'valid-api-key');

    // エラーバッジが非表示になることを確認
    await waitFor(() => {
      expect(errorBadge).toHaveClass('MuiBadge-invisible');
    });
  });

  // テスト14: ソースリストモーダルを開いた時に有効なソース数が正しく表示される
  test('ソースリストモーダルを開いた時に有効なソース数が正しく表示される', async () => {
    const user = userEvent.setup();
    renderAtPath(ROUTES.CHAT);

    // ソース一覧ボタンをクリックしてモーダルを開く
    await user.click(screen.getByTestId('document-list-button'));

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // モーダルが開いていることを確認
    expect(screen.getByText('登録ドキュメント一覧')).toBeInTheDocument();

    // ESCキーでモーダルを閉じる
    await user.keyboard('{Escape}');

    // モーダルが閉じたことを確認
    await waitFor(() => {
      expect(
        screen.queryByText('登録ドキュメント一覧'),
      ).not.toBeInTheDocument();
    });

    // ソース一覧ボタンのバッジを取得
    const sourceListButton = screen.getByTestId('document-list-button');
    const sourceListButtonParent = sourceListButton.closest('.MuiBadge-root');
    const badge = sourceListButtonParent?.querySelector('.MuiBadge-badge');

    // バッジに正しい数が表示されていることを確認
    await waitFor(() => {
      expect(badge).toHaveTextContent('2');
    });
  });

  // テスト15: ソースモーダルで処理中の表示になり、完了後にソース数が表示される
  test('ソースモーダルで処理中の表示になり、完了後にソース数が表示される', async () => {
    const user = userEvent.setup();

    // 処理中のソースデータ
    const processingMockSources: Source[] = [
      {
        id: 1,
        path: '/test/processing1.md',
        title: 'Processing 1',
        status: 'processing' as ProcessStatus,
        isEnabled: true,
        error: null,
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
        summary: 'Test summary 1',
      },
      {
        id: 2,
        path: '/test/processing2.md',
        title: 'Processing 2',
        status: 'completed' as ProcessStatus,
        isEnabled: true,
        error: null,
        createdAt: '2025-05-02T12:00:00.000Z',
        updatedAt: '2025-05-02T12:00:00.000Z',
        summary: 'Test summary 2',
      },
    ];

    // ソース取得のモックを設定（処理中）
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      data: processingMockSources,
    });

    renderAtPath(ROUTES.CHAT);

    // ソース一覧ボタンをクリックしてモーダルを開く
    await user.click(screen.getByTestId('document-list-button'));

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // 処理中のインジケータが表示されることを確認
    await waitFor(() => {
      expect(
        screen.getByTestId('document-loading-indicator'),
      ).toBeInTheDocument();
    });

    // ESCキーでモーダルを閉じる
    await user.keyboard('{Escape}');

    // モーダルが閉じたことを確認
    await waitFor(() => {
      expect(
        screen.queryByText('ドキュメント一覧'),
      ).not.toBeInTheDocument();
    });

    // 完了後のソースデータ
    const completedMockSources: Source[] = [
      {
        id: 1,
        path: '/test/processing1.md',
        title: 'Processing 1',
        status: 'completed' as ProcessStatus,
        isEnabled: true,
        error: null,
        createdAt: '2025-05-01T12:00:00.000Z',
        updatedAt: '2025-05-01T12:00:00.000Z',
        summary: 'Test summary 1',
      },
      {
        id: 2,
        path: '/test/processing2.md',
        title: 'Processing 2',
        status: 'completed' as ProcessStatus,
        isEnabled: true,
        error: null,
        createdAt: '2025-05-02T12:00:00.000Z',
        updatedAt: '2025-05-02T12:00:00.000Z',
        summary: 'Test summary 2',
      },
    ];

    // ソース取得のモックを更新（完了）
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      data: completedMockSources,
    });

    // 再度モーダルを開く
    await user.click(screen.getByTestId('document-list-button'));

    // ソースデータが再取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalledTimes(1);
    });

    // ESCキーでモーダルを閉じる
    await user.keyboard('{Escape}');

    // モーダルが閉じたことを確認
    await waitFor(() => {
      expect(
        screen.queryByText('ドキュメント一覧'),
      ).not.toBeInTheDocument();
    });

    // バッジに有効なソース数（2）が表示されることを確認
    await waitFor(() => {
      const button = screen.getByTestId('document-list-button');
      const buttonParent = button.closest('.MuiBadge-root');
      const badge = buttonParent?.querySelector('.MuiBadge-badge');
      expect(badge).toHaveTextContent('2');
    });
  });

  // テスト16: ソース数が100以上の場合は99+と表示される
  test('ソース数が100以上の場合は99+と表示される', async () => {
    const user = userEvent.setup();

    // 100個以上の有効なソースを含むテストデータを生成
    const largeMockSources: Source[] = Array.from({ length: 150 }, (_, i) => ({
      id: i + 1,
      path: `/test/source${i + 1}.md`,
      title: `Source ${i + 1}`,
      status: 'completed' as ProcessStatus,
      isEnabled: true,
      error: null,
      createdAt: '2025-05-01T12:00:00.000Z',
      updatedAt: '2025-05-01T12:00:00.000Z',
      summary: `Test summary ${i + 1}`,
    }));

    // ソース取得のモックを設定
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      data: largeMockSources,
    });

    renderAtPath(ROUTES.CHAT);

    // ソース一覧ボタンをクリックしてモーダルを開く
    await user.click(screen.getByTestId('document-list-button'));

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // ESCキーでモーダルを閉じる
    await user.keyboard('{Escape}');

    // モーダルが閉じたことを確認
    await waitFor(() => {
      expect(
        screen.queryByText('登録ドキュメント一覧'),
      ).not.toBeInTheDocument();
    });

    // バッジに"99+"が表示されることを確認
    await waitFor(() => {
      const button = screen.getByTestId('document-list-button');
      const buttonParent = button.closest('.MuiBadge-root');
      const badge = buttonParent?.querySelector('.MuiBadge-badge');
      expect(badge).toHaveTextContent('99+');
    });
  });

  // テスト17: チャットルーム一覧の初回データ取得が成功した場合は、ポーリングを解除すること
  test('チャットルーム一覧の初回データ取得が成功した場合は、ポーリングを解除すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 1回目はエラー、2回目以降は成功するモック
    window.electron.chat.getRooms = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch chat rooms'))
      .mockResolvedValue({ success: true, data: mockChatRooms });

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderAtPath(ROUTES.CHAT);

    // 初回呼び出し（エラー）を待機
    await waitFor(() => {
      expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(1);
    });

    // 5秒進める前にマイクロタスクを処理してポーリングを設定
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 2回目の呼び出し（成功）を待機
    await waitFor(() => {
      expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(2);
    });

    // さらに10秒進めてもそれ以上呼ばれないことを確認
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    // 少し待ってから確認
    await waitFor(() => {
      expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(2);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });

  // テスト18: チャットルーム一覧コンポーネントがアンマウントされた際、ポーリングが停止すること
  test('チャットルーム一覧コンポーネントがアンマウントされた際、ポーリングが停止すること', async () => {
    // タイマーをモック化
    jest.useFakeTimers();

    // 常にエラーを返すモック（ポーリングが継続するようにする）
    window.electron.chat.getRooms = jest
      .fn()
      .mockRejectedValue(new Error('Failed to fetch chat rooms'));

    // コンソールエラーをスパイ
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // コンポーネントをレンダリング
    const { unmount } = render(
      <MemoryRouter initialEntries={[ROUTES.CHAT]}>
        <Sidebar onReloadSources={defaultProps.onReloadSources}>
          <Routes>
            <Route
              path={ROUTES.CHAT}
              element={
                <ChatRoomList
                  selectedRoomId={null}
                  onRoomSelect={defaultProps.onRoomSelect}
                />
              }
            />
          </Routes>
        </Sidebar>
      </MemoryRouter>,
    );

    // 初回呼び出しを待機
    await waitFor(() => {
      expect(window.electron.chat.getRooms).toHaveBeenCalled();
    });

    // 5秒進める（ポーリング1回目）
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.electron.chat.getRooms).toHaveBeenCalled();
    });

    const callCountBeforeUnmount = (window.electron.chat.getRooms as jest.Mock)
      .mock.calls.length;

    // コンポーネントをアンマウント
    unmount();

    // さらに10秒進める
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    // ポーリングが停止していることを確認（呼び出し回数が増えない）
    await waitFor(() => {
      expect(
        (window.electron.chat.getRooms as jest.Mock).mock.calls.length,
      ).toBe(callCountBeforeUnmount);
    });

    consoleSpy.mockRestore();
    jest.useRealTimers();
  });
});
