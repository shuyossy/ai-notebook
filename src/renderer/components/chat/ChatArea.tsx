import React, { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { Box, Divider, Typography } from '@mui/material';
import { v4 as uuid } from 'uuid';
import { ChatMessage } from '@/types';
import { IpcRequestPayload, IpcChannels } from '@/types/ipc';
import { useAlertStore } from '@/renderer/stores/alertStore';
import { getSafeErrorMessage, internalError } from '@/renderer/lib/error';
import {
  fileToDataURL,
  arrayBufferToBase64,
  getMimeTypeFromExtension,
} from '@/renderer/lib/fileUtils';
import { useAgentStatusStore } from '../../stores/agentStatusStore';
import MessageList from './MessageList';
import MessageInput, { Attachment } from './MessageInput';
import { ChatApi } from '../../service/chatApi';
import { FsApi } from '../../service/fsApi';

// ai-sdk提供のcreateDataStreamResponseを使ってストリーミングレスポンスを取得する場合の関数
// なぜか適切なヘッダが付与されないので、利用しない
// 将来的にこの部分は、ai-sdk 側で修正されるかもしれないので、保留
// import { createDataStreamResponse } from 'ai';
// const customFetch: typeof fetch = async (input, init) => {
//   if (typeof input === 'string' && input === '/api/chat') {
//     // リクエストボディを復元
//     const { message, threadId } = JSON.parse(init!.body as string);
//     const response = createDataStreamResponse({
//       status: 200,
//       statusText: 'OK',
//       // 必要なら追加ヘッダーを定義
//       // headers: { },
//       async execute(dataStream) {
//         // Mastra のストリーミングを DataStreamWriter にブリッジ
//         const unsubscribe = chatService.streamResponse({
//           onMessage(chunk) {
//             dataStream.writeData(chunk);
//           },
//           onDone() {
//             // 終了時は特に何もしなくて OK
//           },
//           onError(err) {
//             // 例外を投げると onError にフォワードされる
//             throw err;
//           },
//         });

//         // ストリームが終了したら購読解除
//         dataStream.onError?.(() => unsubscribe());
//       },
//       onError(error) {
//         // エラー時にクライアントへ返す文字列
//         return error instanceof Error ? error.message : String(error);
//       },
//     });
//     // Electron → Mastra へメッセージ送信
//     window.electron.chat.sendMessage(threadId, message);
//     console.log('ヘッダー内容: ', response.headers);
//     return response;
//   }

//   // それ以外は通常の fetch を呼び出し
//   return fetch(input, init);
// };

const customFetch: typeof fetch = async (input, init) => {
  if (typeof input === 'string' && input === '/api/chat') {
    let unsubscribe: () => void;
    const encoder = new TextEncoder();
    const chatApi = ChatApi.getInstance();

    const stream = new ReadableStream({
      async start(controller) {
        // イベント購読を確立してから処理を開始
        unsubscribe = await chatApi.streamResponse({
          onMessage(raw) {
            controller.enqueue(encoder.encode(raw));
          },
          onDone() {
            controller.close();
          },
          onError(err) {
            controller.error(err);
          },
        });

        const { messages, roomId } = JSON.parse(
          init!.body as string,
        ) as IpcRequestPayload<typeof IpcChannels.CHAT_SEND_MESSAGE>;
        init?.signal?.addEventListener('abort', () => {
          chatApi.abortChatRequest(roomId, {
            showAlert: false,
            throwError: true,
          });
          unsubscribe();
          controller.close();
        });

        if (init?.method === 'POST') {
          // 購読完了後にメッセージ送信
          chatApi.sendMessage(roomId!, messages, {
            // 上記onErrorでstreamのエラー処理として処理され、エラーメッセージが表示されるためここでは表示しない
            showAlert: false,
            throwError: false,
          });
        }
      },
      cancel() {
        unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        // SSE＋Data Stream Protocol ヘッダ
        'Content-Type': 'text/event-stream; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
    });
  }

  return fetch(input, init);
};

interface ChatAreaProps {
  selectedRoomId: string | null;
  onChatRoomUpdate?: () => void;
}

// プレースホルダーテキストを取得する関数
const getPlaceholderText = (
  status: string,
  isInitializing: boolean,
): string => {
  if (isInitializing) return 'AIエージェント起動中';
  if (status === 'submitted') return 'メッセージ送信中…';
  return 'メッセージを入力してください';
};

const ChatArea: React.FC<ChatAreaProps> = ({
  selectedRoomId,
  onChatRoomUpdate,
}) => {
  const [loading, setLoading] = useState(false);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [editMessageId, setEditMessageId] = useState<string>('');
  const [editMessageContent, setEditMessageContent] = useState<string>('');
  const { status: agentStatus } = useAgentStatusStore();
  const [isEditHistory, setIsEditHistory] = useState(false);
  /* ---------- 添付画像 ---------- */
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // メッセージ入力状態
  const [input, setInput] = useState<string>('');
  // ファイル抽出中フラグ
  const [isExtractingFiles, setIsExtractingFiles] = useState(false);
  const addAlert = useAlertStore((state) => state.addAlert);

  const isAgentInitializing = agentStatus.state === 'saving';

  // メッセージ履歴を取得
  const fetchMessages = async (roomId: string) => {
    const chatApi = ChatApi.getInstance();
    setLoading(true);
    try {
      const chatMessages = await chatApi.getChatMessages(roomId, {
        showAlert: true,
        throwError: true,
      });
      setInitialMessages(chatMessages || []);
    } finally {
      setLoading(false);
    }
  };

  // チャットルームが選択されたらそのメッセージを取得
  useEffect(() => {
    if (selectedRoomId) {
      fetchMessages(selectedRoomId);
    } else {
      setInitialMessages([]);
    }
  }, [selectedRoomId]);

  const { messages, setMessages, reload, status, error, stop } = useChat({
    id: selectedRoomId ?? undefined,
    api: '/api/chat',
    fetch: customFetch,
    initialMessages,
    experimental_throttle: 75,
    onFinish: () => {
      // AIレスポンス完了時にチャットルーム一覧を更新
      if (onChatRoomUpdate) {
        (async () => {
          try {
            onChatRoomUpdate();
          } catch (err) {
            addAlert({
              message: getSafeErrorMessage(
                err,
                'チャットルーム一覧の更新に失敗しました',
              ),
              severity: 'error',
            });
          }
        })();
      }
    },
    experimental_prepareRequestBody: (request) => {
      const chatApi = ChatApi.getInstance();
      // Ensure messages array is not empty and get the last message
      const lastMessage =
        request.messages.length > 0
          ? request.messages[request.messages.length - 1]
          : null;
      if (!lastMessage) {
        throw internalError('送信メッセージの取得に失敗しました', {
          expose: true,
        });
      }

      // 初回メッセージ送信時にスレッドを作成
      // titleについてはここで、指定してもmemoryのオプションでgenerateTitleをtrueにしていた場合、「New Thread 2025-04-27T08:20:05.694Z」のようなタイトルが自動生成されてしまう
      if (selectedRoomId && request.messages.length === 1) {
        chatApi.createThread(selectedRoomId, '', {
          showAlert: false,
          throwError: true,
        });
      }

      // Return the structured body for your API route
      return {
        messages: [lastMessage], // Send only the most recent message content/role
        roomId: selectedRoomId ?? undefined,
      } as IpcRequestPayload<typeof IpcChannels.CHAT_SEND_MESSAGE>;
    },
    onError(err) {
      console.error('useChat error:', err);
    },
  });

  // useChatのエラーをアラートとして表示
  useEffect(() => {
    if (error) {
      addAlert({
        message: getSafeErrorMessage(error),
        severity: 'error',
      });
    }
  }, [error, addAlert]);

  const handleEditStart = (messageId: string) => {
    setEditMessageId(messageId);
  };

  const handleEditContentChange = (content: string) => {
    setEditMessageContent(content);
  };

  /* ---------- メッセージ送信処理 ---------- */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  /* ---------- 添付ファイル操作 ---------- */
  // クリップボードから貼り付けた画像用
  const addAttachments = (files: File[]) => {
    const fileArr = Array.from(files);
    if (!fileArr.length) return;

    const att: Attachment[] = fileArr.map((file) => {
      const isImage = file.type.startsWith('image/');
      return {
        file,
        preview: isImage ? URL.createObjectURL(file) : '',
        isImage,
        // クリップボードからはパスを取得できない
      };
    });
    setAttachments((prev) => [...prev, ...att]);
  };

  // Electronダイアログで選択したファイルからAttachmentを作成
  const addAttachmentsFromPath = async (filePaths: string[]) => {
    const fsApi = FsApi.getInstance();
    const newAttachments: Attachment[] = await Promise.all(
      filePaths.map(async (filePath) => {
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const mimeType = getMimeTypeFromExtension(ext);
        const isImage = mimeType.startsWith('image/');

        // 画像の場合はプレビュー用にファイルを読み込む
        let preview = '';
        if (isImage) {
          const data = await fsApi.readFile(filePath, {
            showAlert: false,
            throwError: false,
          });
          if (data) {
            // Uint8Arrayから新しいArrayBufferを作成してBlobを作成（型互換性のため）
            const buffer = new ArrayBuffer(data.byteLength);
            const view = new Uint8Array(buffer);
            view.set(data);
            const blob = new Blob([buffer], { type: mimeType });
            preview = URL.createObjectURL(blob);
          }
        }

        // ダミーのFileオブジェクトを作成（nameとtypeのみ使用）
        const file = new File([], fileName, { type: mimeType });

        return { file, preview, isImage, path: filePath };
      }),
    );
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  // ファイル選択ダイアログを開く
  const openFileDialog = async () => {
    try {
      const fsApi = FsApi.getInstance();
      const result = await fsApi.showOpenDialog(
        {
          title: 'ファイルを選択',
          filters: [
            {
              name: '対応ファイル',
              extensions: [
                'png',
                'jpg',
                'jpeg',
                'gif',
                'webp',
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
        },
        { showAlert: true, throwError: true },
      );

      if (result && !result.canceled && result.filePaths.length > 0) {
        await addAttachmentsFromPath(result.filePaths);
      }
    } catch (err) {
      addAlert({
        message: getSafeErrorMessage(err, 'ファイル選択に失敗しました'),
        severity: 'error',
      });
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const target = prev[idx];
      // 画像の場合のみメモリ開放
      if (target && target.isImage && target.preview) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;

    const fsApi = FsApi.getInstance();
    const hasNonImageFiles = attachments.some(
      (att) => !att.isImage && att.path,
    );
    const messageId = uuid();

    // Step 2: プレースホルダーでメッセージを即時表示
    const placeholderAttachments = attachments.map((att) => ({
      name: att.file.name,
      contentType: att.isImage ? att.file.type : 'text/plain',
      url: '', // 抽出完了まで空
    }));

    const initialMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: input,
      parts: [{ type: 'text', text: input }],
      experimental_attachments:
        placeholderAttachments.length > 0 ? placeholderAttachments : undefined,
    };

    // 入力をクリアしてメッセージを即座に表示
    const currentInput = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    setMessages((prev) => [...prev, initialMessage]);

    // Step 1 & 3: 非画像ファイルがある場合はファイル抽出状態を有効化
    if (hasNonImageFiles) {
      setIsExtractingFiles(true);
    }

    try {
      /* 添付ファイルを処理
         - 画像: base64に変換（pathがあればファイルを読み込み、なければFileオブジェクトから変換）
         - 非画像: IPC経由でテキスト抽出してData URLに変換 */

      // 非画像ファイルのテキスト抽出を先に実行（エラー時は処理を中止）
      const nonImageAttachments = currentAttachments.filter(
        (att) => !att.isImage && att.path,
      );
      const extractedTexts = new Map<string, string>();

      for (const att of nonImageAttachments) {
        try {
          const text = await fsApi.extractText(att.path!, {
            showAlert: false,
            throwError: true,
          });
          extractedTexts.set(att.path!, text!);
        } catch (err) {
          // エラー発生時: 入力状態を復元し、メッセージを削除
          setInput(currentInput);
          setAttachments(currentAttachments);
          setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
          addAlert({
            message: getSafeErrorMessage(
              err,
              `ファイルの読み込みに失敗しました: ${att.file.name}`,
            ),
            severity: 'error',
          });
          setIsExtractingFiles(false);
          return; // 処理を中止
        }
      }

      // 全ファイルの抽出成功後、添付ファイルを処理
      const processedAttachments = await Promise.all(
        currentAttachments.map(async (att) => {
          if (att.isImage) {
            // 画像: pathがあればファイルを読んでbase64化
            if (att.path) {
              const data = await fsApi.readFile(att.path, {
                showAlert: false,
                throwError: false,
              });
              if (data) {
                const base64 = arrayBufferToBase64(data);
                return {
                  name: att.file.name,
                  contentType: att.file.type,
                  url: `data:${att.file.type};base64,${base64}`,
                };
              }
            }
            // クリップボード画像の場合はFileオブジェクトからDataURLに変換
            return {
              name: att.file.name,
              contentType: att.file.type,
              url: await fileToDataURL(att.file),
            };
          }
          // 非画像ファイル: 事前に抽出済みのテキストを使用
          if (att.path) {
            const content = `# File Path: ${att.path}\n${extractedTexts.get(att.path)!}`;
            const base64 = btoa(unescape(encodeURIComponent(content)));
            return {
              name: att.file.name,
              contentType: 'text/plain',
              url: `data:text/plain;base64,${base64}`,
            };
          }
          // pathがない場合（通常はあり得ない）
          return {
            name: att.file.name,
            contentType: att.file.type,
            url: '',
          };
        }),
      );

      // Step 4: メッセージを最新化
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                experimental_attachments:
                  processedAttachments.length > 0
                    ? processedAttachments
                    : undefined,
              }
            : msg,
        ),
      );
    } finally {
      setIsExtractingFiles(false);
    }

    // Step 5: AI処理を実行
    reload();
  };

  const handleEditSubmit = async () => {
    const chatApi = ChatApi.getInstance();
    const messageIndex = messages.findIndex((m) => m.id === editMessageId);
    if (messageIndex === -1) return;

    const updatedMessages = messages.slice(0, messageIndex + 1);
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: editMessageContent,
      parts: [
        {
          type: 'text',
          text: editMessageContent,
        },
      ],
    };
    setMessages(updatedMessages);
    setIsEditHistory(true);
    try {
      await chatApi.deleteMessagesBeforeSpecificId(
        selectedRoomId!,
        editMessageId,
        {
          showAlert: false,
          throwError: true,
        },
      );
      setEditMessageId('');
      setEditMessageContent('');
      setIsEditHistory(false);
      reload();
    } catch (err) {
      addAlert({
        message: getSafeErrorMessage(err, 'メッセージ編集に失敗しました'),
        severity: 'error',
      });
    } finally {
      setEditMessageId('');
      setEditMessageContent('');
      setIsEditHistory(false);
    }
  };

  const handleEditCancel = () => {
    setEditMessageId('');
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        right: 0,
        top: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      {selectedRoomId ? (
        <>
          {/* メッセージリスト */}
          <MessageList
            messages={messages}
            loading={loading}
            status={status}
            editContent={editMessageContent}
            disabled={
              status === 'submitted' ||
              status === 'streaming' ||
              isAgentInitializing ||
              isEditHistory ||
              isExtractingFiles
            }
            editingMessageId={editMessageId}
            onEditStart={handleEditStart}
            onEditContentChange={handleEditContentChange}
            onEditSubmit={handleEditSubmit}
            onEditCancel={handleEditCancel}
            isProcessingFiles={isExtractingFiles}
            loadingMessage={
              isExtractingFiles ? 'ファイル処理中...' : 'AIKATA作業中…'
            }
          />

          <Divider />

          {/* メッセージ入力 */}
          <MessageInput
            handleSubmit={handleSubmit}
            handleInputChange={handleInputChange}
            message={input}
            disabled={
              status === 'submitted' ||
              status === 'streaming' ||
              isAgentInitializing ||
              isEditHistory ||
              isExtractingFiles
            }
            placeholder={getPlaceholderText(status, isAgentInitializing)}
            isStreaming={status === 'streaming'}
            onStop={stop}
            attachments={attachments}
            onOpenFileDialog={openFileDialog}
            onAddFiles={addAttachments}
            onRemoveAttachment={removeAttachment}
          />

          {/* {error && !isAgentInitializing && (
            <Typography color="error" sx={{ p: 1, textAlign: 'center' }}>
              エラーが発生しました: {error.message}
            </Typography>
          )} */}
        </>
      ) : (
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Typography variant="h6" color="text.secondary">
            新規チャットを開始または既存のチャットを選択してください
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ChatArea;
