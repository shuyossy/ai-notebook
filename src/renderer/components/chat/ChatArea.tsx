import React, { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { Box, Divider, Typography } from '@mui/material';
import { v4 as uuid } from 'uuid';
import useSettingsStatus from '../../hooks/useSettingsStatus';
import MessageList from './MessageList';
import MessageInput, { Attachment } from './MessageInput';
import { chatService } from '../../services/chatService';
import { ChatMessage } from '../../../main/types';
import AlertManager, { AlertMessage } from '../common/AlertMessage';
import { IpcRequestPayload, IpcChannels } from '../../../main/types/ipc';

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

    const stream = new ReadableStream({
      start(controller) {
        unsubscribe = chatService.streamResponse({
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
          console.log('Abort signal received, from threadId: ', roomId);
          window.electron.chat.requestAbort(roomId);
          unsubscribe();
          controller.close();
        });
        window.electron.chat.sendMessage({ roomId, messages });
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

const fileToDataURL = (file: File): Promise<string> =>
  // eslint-disable-next-line
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

const ChatArea: React.FC<ChatAreaProps> = ({ selectedRoomId }) => {
  const [loading, setLoading] = useState(false);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  // useChatからのエラーを表示するための状態
  const [additionalAlerts, setAdditionalAlerts] = useState<AlertMessage[]>([]);
  const [editMessageId, setEditMessageId] = useState<string>('');
  const [editMessageContent, setEditMessageContent] = useState<string>('');
  const { status: settingsStatus } = useSettingsStatus();
  const [isEditHistory, setIsEditHistory] = useState(false);
  /* ---------- 添付画像 ---------- */
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // メッセージ入力状態
  const [input, setInput] = useState<string>('');

  const isAgentInitializing = settingsStatus.state === 'saving';

  // メッセージ履歴を取得
  const fetchMessages = async (roomId: string) => {
    setLoading(true);
    try {
      const chatMessages = await chatService.getChatMessages(roomId);
      setInitialMessages(chatMessages);
    } catch (error) {
      console.error('チャットメッセージの取得に失敗しました:', error);
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
    experimental_prepareRequestBody: (request) => {
      // Ensure messages array is not empty and get the last message
      const lastMessage =
        request.messages.length > 0
          ? request.messages[request.messages.length - 1]
          : null;
      if (!lastMessage) {
        throw new Error('送信メッセージの取得に失敗しました');
      }

      // 初回メッセージ送信時にスレッドを作成
      // titleについてはここで、指定してもmemoryのオプションでgenerateTitleをtrueにしていた場合、「New Thread 2025-04-27T08:20:05.694Z」のようなタイトルが自動生成されてしまう
      if (selectedRoomId && request.messages.length === 1) {
        chatService.createThread(selectedRoomId, '');
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
      setAdditionalAlerts((prev) => [
        ...prev,
        {
          id: uuid(),
          type: 'error',
          content: error.message,
        },
      ]);
    }
  }, [error]);

  // メッセージアラートが閉じられる際の挙動
  const closeAdditionalAlerts = (id: string) => {
    setAdditionalAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

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

  /* ---------- 添付画像操作 ---------- */
  const addAttachments = async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (!fileArr.length) return;

    /* 最大 3 枚に抑制 */
    const newFiles = fileArr.slice(0, 3 - attachments.length);
    const att: Attachment[] = newFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...att]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.preview); // メモリ開放
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;

    /* 添付画像を base64 へ変換しメッセージを追加 */
    const addAttachment = await Promise.all(
      attachments.map(async (att) => ({
        name: att.file.name,
        contentType: att.file.type,
        url: await fileToDataURL(att.file), // ObjectURLではなくbase64に変換
      })),
    );
    const newMessage: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: input,
      parts: [
        {
          type: 'text',
          text: input,
        },
      ],
      experimental_attachments:
        addAttachment.length > 0 ? addAttachment : undefined,
    };
    console.log('新規メッセージ: ', newMessage);

    setInput('');
    // appendだと画像が反映されないため、使わない
    // append(newMessage);
    setMessages((prev) => [...prev, newMessage]);
    reload();

    /* 送信後クリーンアップ */
    setAttachments([]);
  };

  const handleEditSubmit = async () => {
    const messageIndex = messages.findIndex((m) => m.id === editMessageId);
    if (messageIndex === -1) return;
    const oldCreatedAt = messages[messageIndex].createdAt!;
    const oldContent = messages[messageIndex].content;

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
    await window.electron.chat.editHistory({
      threadId: selectedRoomId!,
      oldContent,
      oldCreatedAt,
    });
    setEditMessageId('');
    setEditMessageContent('');
    setIsEditHistory(false);
    reload();
  };

  const handleEditCancel = () => {
    setEditMessageId('');
  };

  return (
    <Box
      sx={{
        width: 'calc(100% - 280px)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        right: 0,
        top: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <AlertManager
        additionalAlerts={additionalAlerts}
        closeAdditionalAlerts={closeAdditionalAlerts}
      />
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
              isEditHistory
            }
            editingMessageId={editMessageId}
            onEditStart={handleEditStart}
            onEditContentChange={handleEditContentChange}
            onEditSubmit={handleEditSubmit}
            onEditCancel={handleEditCancel}
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
              isEditHistory
            }
            placeholder={getPlaceholderText(status, isAgentInitializing)}
            isStreaming={status === 'streaming'}
            onStop={stop}
            attachments={attachments}
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
