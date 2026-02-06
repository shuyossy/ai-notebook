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
import type { ChatRoom, ChatMessage, SettingsSavingState } from '@/types';
import ChatArea from '@/renderer/components/chat/ChatArea';
import { createMockElectronWithOptions } from './test-utils/mockElectronHandler';
import { useAgentStatusStore } from '@/renderer/stores/agentStatusStore';

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
      chatMessages: mockChatMessages,
    });

    // JSDOM上で scrollIntoView をダミー実装
    (window as any).HTMLElement.prototype.scrollIntoView = function () {};

    // agentの起動状態を正常に設定
    useAgentStatusStore.getState().setStatus({
      state: 'done' as SettingsSavingState,
      messages: [],
    });
  });

  // テスト後のクリーンアップ
  afterEach(() => {
    jest.clearAllMocks();
    cleanup();
  });

  // テスト13: AIツール使用時のメッセージ表示が正しく機能すること
  test('AIツール使用時のメッセージ表示が正しく機能すること', async () => {
    window.electron = createMockElectronWithOptions({
      chatRooms: mockChatRooms,
      chatMessages: mockToolMessages,
    });

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
      screen.getByText(
        '新規チャットを開始または既存のチャットを選択してください',
      ),
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
    expect(
      window.electron.chat.deleteMessagesBeforeSpecificId,
    ).toHaveBeenCalledWith({
      threadId: '1',
      messageId: '1',
    });
  });

  // テスト5: ストリーミングレスポンスの処理が正しく機能すること
  // このテストは、ストリーミングレスポンスの処理を確認するためのものですが、
  // JSDOM環境でReadableStreamがサポートされていないため、実行不可
  // テスト不可であることを残すため、コメントアウトをそのまま残す
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

  // テスト6:エージェント起動中の表示が正しいこと
  test('エージェント起動中の表示が正しいこと', async () => {
    render(<ChatArea selectedRoomId="6" />);

    // agentの起動状態を正常に設定
    act(() => {
      useAgentStatusStore.getState().setStatus({
        state: 'saving' as SettingsSavingState,
        messages: [],
      });
    });

    // メッセージ入力欄のプレースホルダーが起動中の表示になることを確認
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('AIエージェント起動中'),
      ).toBeInTheDocument();
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
  // テスト不可であることを残すため、コメントアウトをそのまま残す
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
    // テスト不可であることを残すため、コメントアウトをそのまま残す

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

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/test.png'],
      },
    });
    // readFileのモックも設定（画像プレビュー用）
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // showOpenDialogが呼ばれることを確認
    expect(window.electron.fs.showOpenDialog).toHaveBeenCalled();

    // プレビューが表示されることを確認
    await waitFor(() => {
      const image = screen.getByAltText('attachment-0');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute(
        'src',
        expect.stringContaining('mock-url-'),
      );
    });

    // 複数枚添付の確認（制限なし）
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: [
          '/path/to/test1.png',
          '/path/to/test2.png',
          '/path/to/test3.png',
          '/path/to/test4.png',
        ],
      },
    });
    await user.click(attachButton);

    // 全ての画像（元の1枚 + 追加4枚 = 5枚）が表示されることを確認
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(5);
    });
  });

  // テスト15: 画像付きメッセージの送信が正しく機能すること
  test('画像付きメッセージの送信が正しく機能すること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/test.png'],
      },
    });
    // readFileのモックも設定（画像プレビュー用＋送信時のbase64変換用）
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    render(<ChatArea selectedRoomId="1" />);

    // 入力フィールドが表示されるまで待機
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // ファイル添付ボタンをクリックして画像を選択
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // 画像プレビューが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByAltText('attachment-0')).toBeInTheDocument();
    });

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

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/test.png'],
      },
    });
    // readFileのモックも設定（画像プレビュー用）
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

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
      },
    ];

    window.electron.chat.getMessages = jest
      .fn()
      .mockResolvedValue({ success: true, data: mockMultiImageMessages });

    render(<ChatArea selectedRoomId="18" />);

    // 全ての画像が表示されることを確認
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(3);
      images.forEach((img, idx) => {
        expect(img).toHaveAttribute(
          'alt',
          expect.stringMatching(new RegExp(`test${idx + 1}.png|att-${idx}`)),
        );
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
          },
        ],
      },
    ];

    window.electron.chat.getMessages = jest
      .fn()
      .mockResolvedValue({ success: true, data: mockImageMessage });
    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="19" />);

    // メッセージエリアを取得
    const messageText = await screen.findByText('画像付きメッセージ');

    // ホバー時に編集アイコンが表示されないことを確認
    await user.hover(messageText);
    expect(
      screen.queryByTestId('edit-message-button-1'),
    ).not.toBeInTheDocument();
  });

  // テスト20: ファイル添付アイコンの表示が正しいこと
  test('ファイル添付アイコンの表示が正しいこと', async () => {
    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    // ファイル添付ボタンが存在することを確認（ツールチップで識別）
    const attachButton = screen.getByTestId('chat-attach-file-button');
    expect(attachButton).toBeInTheDocument();
  });

  // テスト21: 非画像ファイル添付が正しく機能すること
  test('非画像ファイル添付が正しく機能すること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/document.txt'],
      },
    });
    // readFileのモックも設定（非画像では使用されないが念のため）
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // showOpenDialogが呼ばれることを確認
    expect(window.electron.fs.showOpenDialog).toHaveBeenCalled();

    // ファイルアイコンとファイル名が表示されることを確認
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-0')).toBeInTheDocument();
      expect(screen.getByText('document.txt')).toBeInTheDocument();
    });
  });

  // テスト22: 非画像ファイル複数添付が正しく機能すること
  test('非画像ファイル複数添付が正しく機能すること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定（複数ファイル選択）
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: [
          '/path/to/doc1.txt',
          '/path/to/doc2.docx',
          '/path/to/doc3.pdf',
          '/path/to/doc4.xlsx',
        ],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // 全てのファイル（4件）が表示されることを確認（制限なし）
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-0')).toBeInTheDocument();
      expect(screen.getByTestId('file-attachment-1')).toBeInTheDocument();
      expect(screen.getByTestId('file-attachment-2')).toBeInTheDocument();
      expect(screen.getByTestId('file-attachment-3')).toBeInTheDocument();
    });
  });

  // テスト23: 画像と非画像ファイルの混合添付が正しく機能すること
  test('画像と非画像ファイルの混合添付が正しく機能すること', async () => {
    const user = userEvent.setup();

    // readFileのモックを設定（画像プレビュー用）
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    // 画像ファイルを選択するモック
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/photo.png'],
      },
    });

    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // 画像サムネイルが表示されることを確認
    await waitFor(() => {
      expect(screen.getByAltText('attachment-0')).toBeInTheDocument();
    });

    // 非画像ファイルを選択するモック
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/report.docx'],
      },
    });

    await user.click(attachButton);

    // ファイルアイコンが表示されることを確認
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-1')).toBeInTheDocument();
      expect(screen.getByText('report.docx')).toBeInTheDocument();
    });
  });

  // テスト24: クリップボードからの画像貼り付けが引き続き機能すること
  test('クリップボードからの画像貼り付けが引き続き機能すること（ファイル添付機能追加後）', async () => {
    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('メッセージを入力してください');

    // 画像ファイルを含むクリップボードイベントを作成
    const imageFile = new File(['dummy image'], 'clipboard.png', {
      type: 'image/png',
    });
    const clipboardData = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => imageFile,
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
    });
  });

  // テスト25: ファイル付きメッセージの送信が正しく機能すること
  test('ファイル付きメッセージの送信が正しく機能すること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/report.docx'],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });
    // extractTextのモックを設定（ファイル送信時にテキスト抽出される）
    const extractedText = 'This is the extracted report content.';
    window.electron.fs.extractText = jest.fn().mockResolvedValue({
      success: true,
      data: extractedText,
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // ファイルが添付されるまで待機
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-0')).toBeInTheDocument();
    });

    await user.type(textInput, 'レポートを添付しました');

    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    await waitFor(() => {
      expect(window.electron.chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: '1',
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: 'レポートを添付しました',
              experimental_attachments: expect.arrayContaining([
                expect.objectContaining({
                  name: 'report.docx',
                  contentType: 'text/plain', // レンダラー側でテキスト抽出後はtext/plain
                  url: expect.stringMatching(/^data:text\/plain;base64,/), // Data URL形式
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    // extractTextが呼ばれたことを確認
    expect(window.electron.fs.extractText).toHaveBeenCalledWith(
      '/path/to/report.docx',
    );
  });

  // テスト26: ファイル付きメッセージの表示が正しいこと
  test('ファイル付きメッセージの表示が正しいこと', async () => {
    const mockFileMessage = [
      {
        id: '1',
        role: 'user',
        content: 'ファイル添付メッセージ',
        createdAt: new Date('2025-05-01T12:00:00.000Z'),
        experimental_attachments: [
          {
            name: 'report.docx',
            contentType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            url: 'data:text/plain;base64,dGVzdCBjb250ZW50',
          },
        ],
      },
    ];

    window.electron.chat.getMessages = jest
      .fn()
      .mockResolvedValue({ success: true, data: mockFileMessage });

    render(<ChatArea selectedRoomId="26" />);

    // ファイルアイコンとファイル名が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('ファイル添付メッセージ')).toBeInTheDocument();
      expect(screen.getByText('report.docx')).toBeInTheDocument();
    });
  });

  // テスト27: ファイル内容表示ダイアログが正しく動作すること
  test('ファイル内容表示ダイアログが正しく動作すること', async () => {
    const user = userEvent.setup();
    const testContent = 'This is the file content for testing.';
    const base64Content = btoa(testContent);
    const mockFileMessage = [
      {
        id: '1',
        role: 'user',
        content: 'ファイル添付テスト',
        createdAt: new Date('2025-05-01T12:00:00.000Z'),
        experimental_attachments: [
          {
            name: 'test.txt',
            contentType: 'text/plain',
            url: `data:text/plain;base64,${base64Content}`,
          },
        ],
      },
    ];

    window.electron.chat.getMessages = jest
      .fn()
      .mockResolvedValue({ success: true, data: mockFileMessage });

    render(<ChatArea selectedRoomId="27" />);

    // ファイルチップが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    // ファイルチップをクリック
    const fileChip = screen.getByText('test.txt');
    await user.click(fileChip);

    // ダイアログが表示され、内容が確認できること
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(testContent)).toBeInTheDocument();
    });
  });

  // テスト28: ファイル付きメッセージの編集機能が無効化されていること
  test('ファイル付きメッセージの編集機能が無効化されていること', async () => {
    const mockFileMessage = [
      {
        id: '1',
        role: 'user',
        content: 'ファイル付きメッセージ',
        createdAt: new Date('2025-05-01T12:00:00.000Z'),
        experimental_attachments: [
          {
            name: 'document.pdf',
            contentType: 'application/pdf',
            url: 'data:text/plain;base64,dGVzdA==',
          },
        ],
      },
    ];

    window.electron.chat.getMessages = jest
      .fn()
      .mockResolvedValue({ success: true, data: mockFileMessage });

    const user = userEvent.setup();
    render(<ChatArea selectedRoomId="28" />);

    // メッセージエリアを取得
    const messageText = await screen.findByText('ファイル付きメッセージ');

    // ホバー時に編集アイコンが表示されないことを確認
    await user.hover(messageText);
    expect(
      screen.queryByTestId('edit-message-button-1'),
    ).not.toBeInTheDocument();
  });

  // テスト29: 添付ファイル削除が正しく機能すること
  test('添付ファイル削除が正しく機能すること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/test.txt'],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // ファイルアイコンが表示されることを確認
    const fileAttachment = await screen.findByTestId('file-attachment-0');
    expect(fileAttachment).toBeInTheDocument();

    // 削除ボタンをクリック
    const closeButton = screen.getByTestId('chat-remove-attachment-0');
    await user.click(closeButton);

    // ファイルアイコンが削除されることを確認
    expect(fileAttachment).not.toBeInTheDocument();
  });

  // テスト30: ファイル抽出中にローディングインジケータが表示されること
  test('ファイル抽出中にローディングインジケータが表示されること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/document.pdf'],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });

    // extractTextのモックを設定（遅延を入れてファイル処理中状態を再現）
    let resolveExtractText: (value: any) => void;
    const extractTextPromise = new Promise((resolve) => {
      resolveExtractText = resolve;
    });
    window.electron.fs.extractText = jest
      .fn()
      .mockReturnValue(extractTextPromise);

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // ファイルが添付されるまで待機
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-0')).toBeInTheDocument();
    });

    await user.type(textInput, 'ファイル処理テスト');

    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    // 「ファイル処理中...」が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('ファイル処理中...')).toBeInTheDocument();
    });

    // extractTextを解決してファイル処理を完了
    resolveExtractText!({
      success: true,
      data: 'Extracted content',
    });

    // 「ファイル処理中...」が消えることを確認（AI処理に移行）
    await waitFor(() => {
      expect(screen.queryByText('ファイル処理中...')).not.toBeInTheDocument();
    });
  });

  // テスト31: ファイル抽出中は入力が無効化されること
  test('ファイル抽出中は入力が無効化されること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/document.pdf'],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });

    // extractTextのモックを設定（遅延を入れてファイル処理中状態を再現）
    let resolveExtractText: (value: any) => void;
    const extractTextPromise = new Promise((resolve) => {
      resolveExtractText = resolve;
    });
    window.electron.fs.extractText = jest
      .fn()
      .mockReturnValue(extractTextPromise);

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // ファイルが添付されるまで待機
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-0')).toBeInTheDocument();
    });

    await user.type(textInput, 'テスト');

    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    // ファイル処理中に入力欄が無効化されていることを確認
    await waitFor(() => {
      expect(screen.getByText('ファイル処理中...')).toBeInTheDocument();
      const input = screen.getByPlaceholderText('メッセージを入力してください');
      expect(input).toBeDisabled();
    });

    // extractTextを解決してファイル処理を完了
    resolveExtractText!({
      success: true,
      data: 'Extracted content',
    });

    // 入力欄が有効化されることを確認（AI処理後）
    await waitFor(() => {
      expect(screen.queryByText('ファイル処理中...')).not.toBeInTheDocument();
    });
  });

  // テスト32: メッセージがファイル抽出前に表示されること
  test('メッセージがファイル抽出前に表示されること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/document.pdf'],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });

    // extractTextのモックを設定（遅延を入れてファイル処理中状態を再現）
    let resolveExtractText: (value: any) => void;
    const extractTextPromise = new Promise((resolve) => {
      resolveExtractText = resolve;
    });
    window.electron.fs.extractText = jest
      .fn()
      .mockReturnValue(extractTextPromise);

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // ファイルが添付されるまで待機
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-0')).toBeInTheDocument();
    });

    await user.type(textInput, 'プレースホルダーテスト');

    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    // ファイル処理中でもメッセージが即座に表示されることを確認
    await waitFor(() => {
      // ファイル処理中の表示
      expect(screen.getByText('ファイル処理中...')).toBeInTheDocument();
      // メッセージも表示されていること
      expect(screen.getByText('プレースホルダーテスト')).toBeInTheDocument();
    });

    // extractTextを解決してファイル処理を完了
    resolveExtractText!({
      success: true,
      data: 'Extracted content',
    });

    // ファイル処理が完了してもメッセージは表示されたままであること
    await waitFor(() => {
      expect(screen.getByText('プレースホルダーテスト')).toBeInTheDocument();
    });
  });

  // テスト33: ファイル抽出完了後にAI処理が開始されること
  test('ファイル抽出完了後にAI処理が開始されること', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/document.pdf'],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array(),
    });

    // extractTextのモックを設定（遅延を入れてファイル処理中状態を再現）
    let resolveExtractText: (value: any) => void;
    const extractTextPromise = new Promise((resolve) => {
      resolveExtractText = resolve;
    });
    window.electron.fs.extractText = jest
      .fn()
      .mockReturnValue(extractTextPromise);

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // ファイルが添付されるまで待機
    await waitFor(() => {
      expect(screen.getByTestId('file-attachment-0')).toBeInTheDocument();
    });

    await user.type(textInput, 'AI処理テスト');

    // sendMessageの呼び出し回数をリセット
    (window.electron.chat.sendMessage as jest.Mock).mockClear();

    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    // ファイル処理中はsendMessageがまだ呼ばれていないことを確認
    await waitFor(() => {
      expect(screen.getByText('ファイル処理中...')).toBeInTheDocument();
    });

    // extractTextを解決してファイル処理を完了
    resolveExtractText!({
      success: true,
      data: 'Extracted content',
    });

    // ファイル処理完了後にsendMessageが呼ばれることを確認
    await waitFor(() => {
      expect(window.electron.chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: '1',
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: 'AI処理テスト',
              experimental_attachments: expect.arrayContaining([
                expect.objectContaining({
                  name: 'document.pdf',
                  contentType: 'text/plain',
                  url: expect.stringMatching(/^data:text\/plain;base64,/),
                }),
              ]),
            }),
          ]),
        }),
      );
    });
  });

  // テスト34: 画像のみの場合はファイル処理中表示がされないこと
  test('画像のみの場合はファイル処理中表示がされないこと', async () => {
    const user = userEvent.setup();

    // showOpenDialogのモックを設定（画像ファイル）
    window.electron.fs.showOpenDialog = jest.fn().mockResolvedValue({
      success: true,
      data: {
        canceled: false,
        filePaths: ['/path/to/image.png'],
      },
    });
    window.electron.fs.readFile = jest.fn().mockResolvedValue({
      success: true,
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    render(<ChatArea selectedRoomId="1" />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('メッセージを入力してください'),
      ).toBeInTheDocument();
    });

    const textInput =
      screen.getByPlaceholderText('メッセージを入力してください');

    // ファイル添付ボタンをクリック
    const attachButton = screen.getByTestId('chat-attach-file-button');
    await user.click(attachButton);

    // 画像プレビューが表示されるまで待機
    await waitFor(() => {
      expect(screen.getByAltText('attachment-0')).toBeInTheDocument();
    });

    await user.type(textInput, '画像テスト');

    const sendButton = screen.getByTestId('chat-send-button');
    await user.click(sendButton);

    // 「ファイル処理中...」が表示されないことを確認
    // 画像の場合はテキスト抽出が不要なので、すぐにAI処理に進む
    expect(screen.queryByText('ファイル処理中...')).not.toBeInTheDocument();
  });
});
