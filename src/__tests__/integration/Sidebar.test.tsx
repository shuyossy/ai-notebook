/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { v4 as uuidv4 } from 'uuid';

import Sidebar from '../../renderer/components/sidebar/Sidebar';
import type { ChatRoom, ProcessStatus } from '../../main/types';
import type { Source } from '../../db/schema';
import { StoreSchema as Settings } from '../../main/store';
import { createMockElectronWithOptions } from '../../__tests__/test-utils/mockElectronHandler';

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
    isEnabled: 1,
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
    isEnabled: 1,
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
    isEnabled: 0,
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
    selectedRoomId: null,
    onRoomSelect: jest.fn(),
    onReloadSources: jest.fn(),
    showSnackbar: jest.fn(),
    onSettingsUpdated: jest.fn(),
  };

  // テスト1: 正常にサイドバーとチャットルーム一覧が表示されること
  test('正常にサイドバーとチャットルーム一覧が表示されること', async () => {
    render(<Sidebar {...defaultProps} />);

    // New Chatボタンが表示されることを確認
    expect(screen.getByText('New Chat')).toBeInTheDocument();

    // チャットルーム一覧が表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('Chat Room 1')).toBeInTheDocument();
      expect(screen.getByText('Chat Room 2')).toBeInTheDocument();
    });

    // フッターのボタンが表示されることを確認
    expect(screen.getByLabelText('ソース一覧を表示')).toBeInTheDocument();
    expect(screen.getByLabelText('設定')).toBeInTheDocument();
  });

  // テスト2: ローディング状態の表示が正しく機能すること
  test('ローディング状態の表示が正しく機能すること', async () => {
    // チャットルーム取得を遅延させる
    window.electron.chat.getRooms = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(mockChatRooms), 100);
        }),
    );

    render(<Sidebar {...defaultProps} />);

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
    window.electron.chat.getRooms = jest.fn().mockResolvedValue([]);

    render(<Sidebar {...defaultProps} />);

    // 空の状態のメッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('チャット履歴がありません')).toBeInTheDocument();
    });
  });

  // テスト4: 新規チャットルームの作成
  test('新規チャットルームの作成', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    // New Chatボタンをクリック
    await user.click(screen.getByText('New Chat'));

    // uuidv4が呼ばれることを確認
    expect(uuidv4).toHaveBeenCalled();

    // onRoomSelectが新しいIDで呼ばれることを確認
    expect(defaultProps.onRoomSelect).toHaveBeenCalledWith('new-room-id');
  });

  // テスト5: チャットルームの選択
  test('チャットルームの選択', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

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
    render(<Sidebar {...defaultProps} />);

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
    window.electron.chat.deleteRoom = jest
      .fn()
      .mockRejectedValue(new Error('Failed to delete chat room'));

    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

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
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  // テスト8: フッターのソース一覧モーダル表示
  test('フッターのソース一覧モーダル表示', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    // ソース一覧ボタンをクリック
    await user.click(screen.getByTestId('document-list-button'));

    // SourceListModalが表示されることを確認
    expect(screen.getByText('ソース一覧')).toBeInTheDocument();
  });

  // テスト9: フッターの設定モーダル表示
  test('フッターの設定モーダル表示', async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    // 設定ボタンをクリック
    await user.click(screen.getByTestId('settings-button'));

    // SettingsModalが表示されることを確認
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // テスト10: チャットルーム一覧の自動更新
  test('チャットルーム一覧の自動更新', async () => {
    // jestのタイマーを使用
    jest.useFakeTimers();

    render(<Sidebar {...defaultProps} />);

    // 初回の取得を確認
    await waitFor(() => {
      expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(1);
    });

    // 5秒進める
    jest.advanceTimersByTime(5000);

    // 更新が呼ばれることを確認
    expect(window.electron.chat.getRooms).toHaveBeenCalledTimes(2);

    // タイマーをクリーンアップ
    jest.useRealTimers();
  });

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

    render(<Sidebar {...defaultProps} />);

    // エラーログが出力されることを確認
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    // ローディング状態が維持されることを確認
    expect(screen.getByText('チャット履歴取得中')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  // テスト12: 設定エラーバッジの初期表示
  test('設定エラーバッジの初期表示', async () => {
    render(<Sidebar {...defaultProps} />);

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
    render(<Sidebar {...defaultProps} />);

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

  // テスト14: ソースリストの初期表示で有効なソース数が正しく表示される
  test('ソースリストの初期表示で有効なソース数が正しく表示される', async () => {
    // タイマーのモック
    jest.useFakeTimers();

    render(<Sidebar {...defaultProps} />);

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
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

  // テスト15: ソースの読み込み中は処理中の表示になり、完了後にソース数が表示される
  test('ソースの読み込み中は処理中の表示になり、完了後にソース数が表示される', async () => {
    // タイマーのモック
    jest.useFakeTimers();

    // 処理中のソースデータ
    const processingMockSources: Source[] = [
      {
        id: 1,
        path: '/test/processing1.md',
        title: 'Processing 1',
        status: 'processing' as ProcessStatus,
        isEnabled: 1,
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
        isEnabled: 1,
        error: null,
        createdAt: '2025-05-02T12:00:00.000Z',
        updatedAt: '2025-05-02T12:00:00.000Z',
        summary: 'Test summary 2',
      },
    ];

    // 完了後のソースデータ
    const completedMockSources: Source[] = [
      {
        id: 1,
        path: '/test/processing1.md',
        title: 'Processing 1',
        status: 'completed' as ProcessStatus,
        isEnabled: 1,
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
        isEnabled: 1,
        error: null,
        createdAt: '2025-05-02T12:00:00.000Z',
        updatedAt: '2025-05-02T12:00:00.000Z',
        summary: 'Test summary 2',
      },
    ];

    // ソース取得のモックを設定（最初は処理中、その後完了）
    let isFirstCall = true;
    window.electron.source.getSources = jest.fn().mockImplementation(() => {
      if (isFirstCall) {
        isFirstCall = false;
        return Promise.resolve({
          success: true,
          sources: processingMockSources,
        });
      }
      return Promise.resolve({
        success: true,
        sources: completedMockSources,
      });
    });

    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    // 進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

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

    // 5秒待機してソースデータが更新されることを確認
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // バッジに有効なソース数（2）が表示されることを確認
    await waitFor(() => {
      const button = screen.getByTestId('document-list-button');
      const buttonParent = button.closest('.MuiBadge-root');
      const badge = buttonParent?.querySelector('.MuiBadge-badge');
      expect(badge).toHaveTextContent('2');
    });

    // タイマーをクリーンアップ
    jest.useRealTimers();
  }, 20000);

  // テスト16: ソース数が100以上の場合は99+と表示される
  test('ソース数が100以上の場合は99+と表示される', async () => {
    // タイマーのモック
    jest.useFakeTimers();

    // 100個以上の有効なソースを含むテストデータを生成
    const largeMockSources: Source[] = Array.from({ length: 150 }, (_, i) => ({
      id: i + 1,
      path: `/test/source${i + 1}.md`,
      title: `Source ${i + 1}`,
      status: 'completed' as ProcessStatus,
      isEnabled: 1,
      error: null,
      createdAt: '2025-05-01T12:00:00.000Z',
      updatedAt: '2025-05-01T12:00:00.000Z',
      summary: `Test summary ${i + 1}`,
    }));

    // ソース取得のモックを設定
    window.electron.source.getSources = jest.fn().mockResolvedValue({
      success: true,
      sources: largeMockSources,
    });

    render(<Sidebar {...defaultProps} />);

    // タイマーを進める
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ソースデータが取得されるまで待機
    await waitFor(() => {
      expect(window.electron.source.getSources).toHaveBeenCalled();
    });

    // バッジに"99+"が表示されることを確認
    await waitFor(() => {
      const button = screen.getByTestId('document-list-button');
      const buttonParent = button.closest('.MuiBadge-root');
      const badge = buttonParent?.querySelector('.MuiBadge-badge');
      expect(badge).toHaveTextContent('99+');
    });

    // タイマーをクリーンアップ
    jest.useRealTimers();
  });
});
