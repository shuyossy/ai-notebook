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
import type { ChatRoom, ChatMessage } from '../../main/types';
import ChatArea from '../../renderer/components/chat/ChatArea';
import { createMockElectronWithOptions } from '../test-utils/mockElectronHandler';

// File APIのモック
global.URL.createObjectURL = jest.fn(
  (blob: any) => `mock-url-${blob.name || 'file'}`,
);
global.URL.revokeObjectURL = jest.fn();

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

const mockToolMessages: ChatMessage[] = [
  {
    id: '3',
    role: 'user',
    content: 'ファイルを検索して',
    createdAt: new Date('2025-05-01T12:02:00.000Z'),
  },
  {
    id: '4',
    role: 'assistant',
    content: '検索を実行します',
    createdAt: new Date('2025-05-01T12:03:00.000Z'),
    parts: [
      {
        type: 'text',
        text: '検索を実行します',
      },
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolName: 'documentQueryTool',
          toolCallId: 'search-1',
          args: {
            documentQueries: [
              {
                path: '/test/file.txt',
                query: 'test',
              },
            ],
          },
          state: 'result',
          result: {
            matches: ['テスト結果です'],
          },
        },
      },
      {
        type: 'text',
        text: '検索が完了しました',
      },
    ],
  },
  {
    id: '5',
    role: 'user',
    content: '別のツールも使って',
    createdAt: new Date('2025-05-01T12:04:00.000Z'),
  },
  {
    id: '6',
    role: 'assistant',
    content: '複数のツールを使用します',
    createdAt: new Date('2025-05-01T12:05:00.000Z'),
    parts: [
      {
        type: 'text',
        text: '複数のツールを使用します',
      },
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolName: 'documentQueryTool',
          toolCallId: 'search-2',
          args: {
            documentQueries: [
              {
                path: '/test/file2.txt',
                query: 'test2',
              },
            ],
          },
          state: 'result',
          result: {
            matches: ['テスト結果2です'],
          },
        },
      },
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolName: 'updateWorkingMemory',
          toolCallId: 'memory-1',
          args: {
            content: 'メモリを更新',
          },
          state: 'result',
          result: true,
        },
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

  // テスト13: AIツール使用時のメッセージ表示が正しく機能すること
  test('AIツール使用時のメッセージ表示が正しく機能すること', async () => {
    window.electron.chat.getMessages = jest
      .fn()
      .mockResolvedValue(mockToolMessages);

    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    // メッセージ取得が呼ばれることを確認
    expect(window.electron.chat.getMessages).toHaveBeenCalledWith('1');

    // メッセージとツール使用の表示を確認
    await waitFor(() => {
      expect(screen.getByText('ファイルを検索して')).toBeInTheDocument();
      expect(screen.getByText('検索を実行します')).toBeInTheDocument();
      expect(screen.getByText('検索が完了しました')).toBeInTheDocument();
    });

    // ツール使用のアコーディオンが表示されることを確認
    const accordions = screen.getAllByRole('button', {
      name: /ドキュメント検索/,
    });
    expect(accordions.length).toEqual(2);

    // 1つ目のドキュメント検索の結果が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/テスト結果です/)).toBeInTheDocument();
    });

    // 複数ツールの使用時の表示を確認
    expect(screen.getByText('別のツールも使って')).toBeInTheDocument();
    expect(screen.getByText('複数のツールを使用します')).toBeInTheDocument();

    const memoryUpdateText = screen.getByText('メモリ更新中');
    expect(memoryUpdateText).toBeInTheDocument();

    // 2つ目のドキュメント検索の結果が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/テスト結果2です/)).toBeInTheDocument();
    });
  }, 20000);

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
        expect.objectContaining({
          // roomId が '1' であること
          roomId: '1',

          // messages が配列で、かつ中に以下を含むこと
          messages: expect.arrayContaining([
            expect.objectContaining({
              // content プロパティ
              content: 'テストメッセージ',

              // role プロパティ
              role: 'user',

              // parts が配列で、かつ中に text: 'テストメッセージ' を含むこと
              parts: expect.arrayContaining([
                expect.objectContaining({ text: 'テストメッセージ' }),
              ]),
            }),
          ]),
        }),
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
      const errorAlert = alerts.find((alert) =>
        alert.textContent?.includes('AIエージェントの起動に失敗しました'),
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
    await waitFor(() => {
      expect(window.electron.chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          // roomId が '1' であること
          roomId: '1',

          // messages が配列で、かつ中に以下を含むこと
          messages: expect.arrayContaining([
            expect.objectContaining({
              // content プロパティ
              content: 'テストメッセージ',

              // role プロパティ
              role: 'user',

              // parts が配列で、かつ中に text: 'テストメッセージ' を含むこと
              parts: expect.arrayContaining([
                expect.objectContaining({ text: 'テストメッセージ' }),
              ]),
            }),
          ]),
        }),
      );
    });

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
    const targetAlert = alerts.find((alert) =>
      alert.textContent?.includes(errorMessage),
    );
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

  // テスト14: 画像添付が正しく機能すること
  test('画像添付が正しく機能すること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    // ファイル選択による画像の添付
    const file = new File(['dummy content'], 'test.png', {
      type: 'image/png',
    });
    const fileInput = screen.getByTestId('chat-file-input');

    // 画像を1枚追加
    await user.upload(fileInput, file);

    // プレビューが表示されることを確認
    await waitFor(() => {
      const image = screen.getByAltText('attachment-0');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute(
        'src',
        expect.stringContaining('mock-url-'),
      );
    });

    // 最大3枚までの制限を確認
    const files = [
      new File(['dummy1'], 'test1.png', { type: 'image/png' }),
      new File(['dummy2'], 'test2.png', { type: 'image/png' }),
      new File(['dummy3'], 'test3.png', { type: 'image/png' }),
      new File(['dummy4'], 'test4.png', { type: 'image/png' }),
    ];
    await user.upload(fileInput, files);

    // プレビューが3枚のみ表示されることを確認
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);

    // 上限到達の警告メッセージが表示されることを確認
    expect(screen.getByText('添付は最大 3 枚までです')).toBeInTheDocument();
  });

  // テスト15: 画像付きメッセージの送信が正しく機能すること
  test('画像付きメッセージの送信が正しく機能すること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    // 入力フィールドが表示されるまで待機
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const file = new File(['dummy content'], 'test.png', {
      type: 'image/png',
    });
    const fileInput = screen.getByTestId('chat-file-input');
    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // 画像とテキストを追加
    await user.upload(fileInput, file);
    await user.type(textInput, 'テスト画像付きメッセージ');

    // 送信ボタンをクリック
    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    // 送信リクエストが正しい形式で呼ばれることを確認
    await waitFor(() => {
      expect(window.electron.chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: '1',
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: 'テスト画像付きメッセージ',
              role: 'user',
              parts: expect.arrayContaining([
                expect.objectContaining({
                  type: 'text',
                  text: 'テスト画像付きメッセージ',
                }),
              ]),
              experimental_attachments: expect.arrayContaining([
                expect.objectContaining({
                  contentType: 'image/png',
                  name: 'test.png',
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    // 送信後に入力欄とプレビューがクリアされることを確認
    expect(textInput).toHaveValue('');
    expect(screen.queryByAltText('attachment-0')).not.toBeInTheDocument();
  });

  // テスト16: クリップボードからの画像貼り付けが正しく機能すること
  test('クリップボードからの画像貼り付けが正しく機能すること', async () => {
    render(<ChatArea selectedRoomId="1" />);

    // 入力フィールドが表示されるまで待機
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('メッセージを入力してください');

    // 画像ファイルを含むクリップボードイベントを作成
    const imageFile = new File(['dummy image'], 'paste.png', {
      type: 'image/png',
    });
    const clipboardData = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => imageFile,
        },
        {
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        },
      ],
    };

    // クリップボードイベントを発火
    fireEvent.paste(input, {
      clipboardData,
    });

    // 画像プレビューが表示されることを確認
    await waitFor(() => {
      const image = screen.getByAltText('attachment-0');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute(
        'src',
        expect.stringContaining('mock-url-'),
      );
    });
  });

  // テスト17: 添付画像の削除が正しく機能すること
  test('添付画像の削除が正しく機能すること', async () => {
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="1" />);

    // 画像を添付
    const file = new File(['dummy content'], 'test.png', {
      type: 'image/png',
    });
    const fileInput = screen.getByTestId('chat-file-input');

    await user.upload(fileInput, file);

    // プレビューと削除ボタンが表示されることを確認
    const image = await screen.findByAltText('attachment-0');
    expect(image).toBeInTheDocument();

    // 削除ボタンをクリック
    const closeButton = screen.getByTestId('chat-remove-attachment-0');
    await user.click(closeButton);

    // プレビューが削除されることを確認
    expect(image).not.toBeInTheDocument();

    // ObjectURLが解放されることを確認
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      expect.stringContaining('mock-url-'),
    );
  });

  // テスト18: 複数画像付きメッセージが正しく表示されること
  test('複数画像付きメッセージが正しく表示されること', async () => {
    const mockMultiImageMessages = [
      {
        id: '1',
        role: 'user',
        content: '複数画像テスト',
        createdAt: new Date('2025-05-01T12:00:00.000Z'),
        experimental_attachments: [
          {
            name: 'test1.png',
            contentType: 'image/png',
            url: 'data:image/png;base64,dummybase64-1',
          },
          {
            name: 'test2.png',
            contentType: 'image/png',
            url: 'data:image/png;base64,dummybase64-2',
          },
          {
            name: 'test3.png',
            contentType: 'image/png',
            url: 'data:image/png;base64,dummybase64-3',
          },
        ],
      }
    ];

    window.electron.chat.getMessages = jest.fn().mockResolvedValue(mockMultiImageMessages);

    render(<ChatArea selectedRoomId="18" />);

    // 全ての画像が表示されることを確認
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(3);
      images.forEach((img, idx) => {
        expect(img).toHaveAttribute('alt', expect.stringMatching(new RegExp(`test${idx + 1}.png|att-${idx}`)));
      });
    });
  });

  // テスト19: 画像付きメッセージの編集機能が無効化されていること
  test('画像付きメッセージの編集機能が無効化されていること', async () => {
    const mockImageMessage = [
      {
        id: '1',
        role: 'user',
        content: '画像付きメッセージ',
        createdAt: new Date('2025-05-01T12:00:00.000Z'),
        experimental_attachments: [
          {
            name: 'test.png',
            contentType: 'image/png',
            url: 'data:image/png;base64,dummybase64',
          }
        ],
      }
    ];

    window.electron.chat.getMessages = jest.fn().mockResolvedValue(mockImageMessage);
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="19" />);

    // メッセージエリアを取得
    const messageText = await screen.findByText('画像付きメッセージ');

    // ホバー時に編集アイコンが表示されないことを確認
    await user.hover(messageText);
    expect(screen.queryByTestId('edit-message-button-1')).not.toBeInTheDocument();
  });
});
