/**
 * @jest-environment jsdom
 */
// ブラウザ環境のReadableStreamを再現できず、useChatが正常に動作しない
// そのため本テストについてはメッセージ送信・編集実施後の画面表示やエラー表示などの確認は行わない
import React from 'react';
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
  within,
  cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ChatRoom, ChatMessage } from '../../main/types';
import ChatArea from '../../renderer/components/chat/ChatArea';
import { createMockElectronWithOptions } from '../test-utils/mockElectronHandler';

// JSDOMではReadableStreamがサポートされていないため、polyfillを使用
const { ReadableStream } = require('web-streams-polyfill/ponyfill');
global.ReadableStream = ReadableStream;

// TextEncoderも同様にモック
const { TextEncoder } = require('util');
global.TextEncoder = TextEncoder;

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

// テスト用のモックデータ
const mockChatRooms: ChatRoom[] = [
  {
    id: '1',
    resourceId: 'user',
    title: 'Chat Room 1',
    createdAt: new Date('2025-05-01T12:00:00.000Z'),
    updatedAt: new Date('2025-05-01T12:00:00.000Z'),
  },
  {
    id: '2',
    resourceId: 'user',
    title: 'Chat Room 2',
    createdAt: new Date('2025-05-02T12:00:00.000Z'),
    updatedAt: new Date('2025-05-02T12:00:00.000Z'),
  },
];

const mockChatMessages: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: 'こんにちは',
    createdAt: new Date('2025-05-01T12:00:00.000Z'),
  },
  {
    id: '2',
    role: 'assistant',
    content: 'はい、こんにちは！',
    createdAt: new Date('2025-05-01T12:01:00.000Z'),
    parts: [
      {
        type: 'text',
        text: 'はい、こんにちは！',
      },
    ],
  },
];

describe('ChatArea Component', () => {
  // テスト前のセットアップ
  beforeEach(() => {
    window.electron = createMockElectronWithOptions({
      chatRooms: mockChatRooms,
    });

    // チャットメッセージの取得をモック
    window.electron.chat.getMessages = jest
      .fn()
      .mockResolvedValue(mockChatMessages);

    // JSDOM上で scrollIntoView をダミー実装
    (window as any).HTMLElement.prototype.scrollIntoView = function () {};
  });

  // テスト後のクリーンアップ
  afterEach(() => {
    jest.clearAllMocks();
    cleanup();
  });

  // テスト1: チャットエリアの初期表示が正しいこと
  test('チャットエリアの初期表示が正しいこと', async () => {
    render(<ChatArea selectedRoomId="1" />);

    // メッセージ取得が呼ばれることを確認
    expect(window.electron.chat.getMessages).toHaveBeenCalledWith('1');

    // メッセージが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('こんにちは')).toBeInTheDocument();
      expect(screen.getByText('はい、こんにちは！')).toBeInTheDocument();
    });

    // メッセージ入力フィールドが表示されることを確認
    expect(
      screen.getByPlaceholderText('メッセージを入力してください'),
    ).toBeInTheDocument();
  });

  // テスト2: チャットルーム未選択時の表示が正しいこと
  test('チャットルーム未選択時の表示が正しいこと', async () => {
    render(<ChatArea selectedRoomId={null} />);

    // メッセージ取得が呼ばれないことを確認
    expect(window.electron.chat.getMessages).not.toHaveBeenCalled();

    // ガイダンステキストが表示されることを確認
    expect(
      screen.getByText('チャットルームを選択してください'),
    ).toBeInTheDocument();
  });

  // テスト3: メッセージ送信が正しく機能すること
  test('メッセージ送信が正しく機能すること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    // メッセージ入力
    // 入力フィールドが表示されるまで待機
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('メッセージを入力してください');
    await user.type(input, 'テストメッセージ');
    expect(input).toHaveValue('テストメッセージ');

    // 送信ボタンをクリック
    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    // 送信処理が呼ばれることを確認
    await waitFor(() => {
      expect(window.electron.chat.sendMessage).toHaveBeenCalledWith(
        '1',
        'テストメッセージ',
      );
    });
  });

  // テスト4: メッセージ編集機能が正しく動作すること
  test('メッセージ編集機能が正しく動作すること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(screen.getByText('こんにちは')).toBeInTheDocument();
    });

    // 編集アイコンをホバーして表示
    const userMessage = screen.getByText('こんにちは');
    await user.hover(userMessage);

    // 編集アイコンをクリック
    const editButton = screen.getByTestId('edit-message-button-1');
    await user.click(editButton);

    // 編集フィールドが表示されることを確認
    // テキストフィールドのコンテナを取得
    const wrapper = screen.getByTestId('edit-message-input-1');
    // その中の実際の textarea を探す
    const textarea = within(wrapper).getByRole('textbox');
    expect(textarea).toHaveValue('こんにちは');

    // メッセージを編集
    await user.clear(textarea);
    await user.type(textarea, '編集後のメッセージ');

    // 送信ボタンをクリック
    const saveButton = screen.getByTestId('edit-message-send-button-1');
    await user.click(saveButton);

    // 編集リクエストが送信されることを確認
    expect(window.electron.chat.editHistory).toHaveBeenCalledWith({
      threadId: '1',
      oldContent: 'こんにちは',
      oldCreatedAt: mockChatMessages[0].createdAt,
    });
  });

  // テスト5: ストリーミングレスポンスの処理が正しく機能すること
  // このテストは、ストリーミングレスポンスの処理を確認するためのものですが、
  // JSDOM環境でReadableStreamがサポートされていないため、実行不可
  // whatwg-fetchを使用してReadableStreamをモック化してもuseChatのストリーミング処理が正しく動作しないため、コメントアウト
  // test('ストリーミングレスポンスの処理が正しく機能すること', async () => {
  //   let streamCallback: (data: any) => void = () => {};
  //   let completeCallback: () => void = () => {};

  //   // ストリームイベントのモック
  //   window.electron.chat.onStream = jest.fn((callback) => {
  //     streamCallback = callback;
  //     return () => {};
  //   });

  //   window.electron.chat.onComplete = jest.fn((callback) => {
  //     completeCallback = callback;
  //     return () => {};
  //   });

  //   render(<ChatArea selectedRoomId="1" />);

  //   // メッセージを送信
  //   const user = userEvent.setup();
  //   // 入力フィールドが表示されるまで待機
  //   await waitFor(() => {
  //     expect(
  //       screen.getByPlaceholderText('メッセージを入力してください'),
  //     ).toBeInTheDocument();
  //   });
  //   const input = screen.getByPlaceholderText('メッセージを入力してください');
  //   await user.type(input, 'テストメッセージ');
  //   // 送信ボタンをクリック
  //   const sendButton = screen.getByTestId('chat-send-button');
  //   await user.click(sendButton);

  //   // ストリーミングデータをシミュレート
  //   const initialMessage = [{type:"status",value:"processing"}];
  //   const message = 'ストリーミング'
  //   act(() => {
  //     streamCallback(`8:${JSON.stringify(initialMessage)}\n`);
  //     streamCallback(`0:${JSON.stringify(message)}\n`);
  //   });

  //   // ストリーミングメッセージが表示されることを確認
  //   await waitFor(() => {
  //     expect(screen.getByText(message)).toBeInTheDocument();
  //   }, {timeout: 20000});

  //   // 完了イベントをシミュレート
  //   act(() => {
  //     completeCallback();
  //   });

  //   // 「AIKATA作業中...」の表示が消えることを確認
  //   await waitFor(() => {
  //     expect(screen.queryByText('AIKATA作業中…')).not.toBeInTheDocument();
  //   });
  // }, 20000);

  // テスト6:エージェント起動関連エラーの表示が正しいこと
  test('エージェント起動関連エラーの表示が正しいこと', async () => {
    window.electron = createMockElectronWithOptions({
      chatRooms: mockChatRooms,
      agentStatus: {
        state: 'error',
        messages: [
          {
            id: '1',
            type: 'error',
            content: 'AIエージェントの起動に失敗しました',
          },
        ],
      },
    });

    render(<ChatArea selectedRoomId="1" />);

    // エラーメッセージが表示されることを確認
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      const errorAlert = alerts.find(alert =>
        alert.textContent?.includes('AIエージェントの起動に失敗しました')
      );
      expect(errorAlert).toBeInTheDocument();
    });
  });

  // テスト7: メッセージ送信のキーボードショートカットが機能すること
  test('メッセージ送信のキーボードショートカットが機能すること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    // メッセージを入力
    // 入力フィールドが表示されるまで待機
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('メッセージを入力してください');
    await user.type(input, 'テストメッセージ');

    // Enterキーを押す
    await user.keyboard('{Enter}');

    // 送信処理が呼ばれることを確認
    expect(window.electron.chat.sendMessage).toHaveBeenCalledWith(
      '1',
      'テストメッセージ',
    );

    // Shift+Enterで改行されることを確認
    await user.clear(input);
    await user.type(input, 'テスト');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(input).toHaveValue('テスト\n');
  });

  // テスト8: ストリーミング中に停止ボタンが機能すること
  // ストリーミング処理が実施されないため停止ボタンも表示されない
  // test('ストリーミング中に停止ボタンが機能すること', async () => {
  //   const user = userEvent.setup();
  //   render(<ChatArea selectedRoomId="1" />);

  //   // メッセージを送信してストリーミングを開始
  //   // 入力フィールドが表示されるまで待機
  //   await waitFor(() => {
  //     expect(
  //       screen.getByPlaceholderText('メッセージを入力してください'),
  //     ).toBeInTheDocument();
  //   });
  //   const input = screen.getByPlaceholderText('メッセージを入力してください');
  //   await user.type(input, 'テストメッセージ');
  //   const sendButton = screen.getByTestId('chat-send-button');
  //   await user.click(sendButton);

  //   // 停止ボタンが表示されることを確認
  //   const stopButton = screen.getByTestId('chat-stop-button');
  //   expect(stopButton).toBeInTheDocument();

  //   // 停止ボタンをクリック
  //   await user.click(stopButton);

  //   // 中断リクエストが送信されることを確認
  //   expect(window.electron.chat.requestAbort).toHaveBeenCalledWith('1');
  // });

  // テスト9: IME変換中のEnterキーが正しく処理されること
  test('IME変換中のEnterキーが正しく処理されること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('メッセージを入力してください');
    await user.type(input, 'テストメッセージ');

    // IME変換開始イベントをシミュレート
    fireEvent.compositionStart(input);

    // IME変換中のEnterキーを押す
    await user.keyboard('{Enter}');

    // メッセージが送信されないことを確認
    expect(window.electron.chat.sendMessage).not.toHaveBeenCalled();

    // fireEventでIME変換をシミュレートした場合、Enterキーを押してもIME変換が確定しないため、後続はコメントアウト

    // // IME変換確定イベントをシミュレート
    // fireEvent.compositionEnd(input);

    // // 変換確定後のEnterキーを押す
    // await user.keyboard('{Enter}');

    // // メッセージが送信されることを確認
    // expect(window.electron.chat.sendMessage).toHaveBeenCalledWith(
    //   '1',
    //   'テストメッセージ',
    // );
  });

  // テスト10: アラートメッセージの閉じるボタンが機能すること
  test('アラートメッセージの閉じるボタンが機能すること', async () => {
    const user = userEvent.setup();
    window.electron = createMockElectronWithOptions({
      chatRooms: mockChatRooms,
      agentStatus: {
        state: 'error',
        messages: [
          {
            id: '1',
            type: 'error',
            content: 'AIエージェントの起動に失敗しました',
          },
        ],
      },
    });

    render(<ChatArea selectedRoomId="1" />);

    // AIエージェントの起動失敗メッセージが表示されることを確認
    const errorMessage = 'AIエージェントの起動に失敗しました';
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // 閉じるボタンをクリック
    const alerts = screen.getAllByRole('alert');
    const targetAlert = alerts.find(alert => alert.textContent?.includes(errorMessage));
    expect(targetAlert).toBeInTheDocument();

    const closeButton = within(targetAlert!).getByRole('button');
    await act(async () => {
      await user.click(closeButton);
    });

    // window.electron.agent.removeMessageが呼ばれることを確認
    expect(window.electron.agent.removeMessage).toHaveBeenCalledWith('1');
  });

  // テスト11: エージェント初期化中の表示が正しいこと
  test('エージェント初期化中の表示が正しいこと', async () => {
    window.electron = createMockElectronWithOptions({
      chatRooms: mockChatRooms,
      agentStatus: {
        state: 'initializing',
      },
    });

    render(<ChatArea selectedRoomId="1" />);

    // 入力欄のプレースホルダーが初期化中の表示になることを確認
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('AIエージェント起動中'),
      ).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('AIエージェント起動中');
    expect(input).toBeDisabled();
  });

  // テスト12: メッセージ編集のキャンセルが正しく機能すること
  test('メッセージ編集のキャンセルが正しく機能すること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="2" />);

    await waitFor(() => {
      expect(screen.getByText('こんにちは')).toBeInTheDocument();
    });

    // 編集アイコンをホバーして表示
    const userMessage = screen.getByText('こんにちは');
    await user.hover(userMessage);

    // 編集アイコンをクリック
    const editButton = screen.getByTestId('edit-message-button-1');
    await user.click(editButton);

    // 編集フィールドが表示されることを確認
    // テキストフィールドのコンテナを取得
    const wrapper = screen.getByTestId('edit-message-input-1');
    // その中の実際の textarea を探す
    const textarea = within(wrapper).getByRole('textbox');
    expect(textarea).toHaveValue('こんにちは');

    // メッセージを編集
    await user.clear(textarea);
    await user.type(textarea, '編集後のメッセージ');

    // キャンセルボタンをクリック
    const cancelButton = screen.getByTestId('edit-message-cancel-button-1');
    await user.click(cancelButton);

    // 編集モードが終了し、元のメッセージが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('こんにちは')).toBeInTheDocument();
      expect(screen.queryByText('編集後のメッセージ')).not.toBeInTheDocument();
    });
  });
});
