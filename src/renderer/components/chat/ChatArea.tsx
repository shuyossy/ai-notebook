import React, { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { Box, Divider, Typography, Alert } from '@mui/material';
import { v4 as uuid } from 'uuid';
import useAgentStatus from '../../hooks/useAgentStatus';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { chatService } from '../../services/chatService';
import { ChatMessage } from '../../../main/types';
import { useAgentStore } from '../../stores/agentStore';

interface AlertMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error' | undefined;
  content: string;
}
interface AlertManagerProps {
  additionalAlerts: AlertMessage[] | undefined;
  closeAdditionalAlerts?: (id: string) => void;
}
const AlertManager: React.FC<AlertManagerProps> = ({
  additionalAlerts,
  closeAdditionalAlerts,
}) => {
  const { status, closeMessage } = useAgentStore();
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'fit-content',
        maxWidth: '80%',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {status.messages?.map((message) => (
        <Alert
          key={message.id}
          severity={message.type}
          sx={{ whiteSpace: 'pre-line' }}
          onClose={() => closeMessage(message.id)}
        >
          {message.content}
        </Alert>
      ))}
      {additionalAlerts?.map((alert) => (
        <Alert
          key={alert.id}
          severity={alert.type}
          sx={{ whiteSpace: 'pre-line' }}
          onClose={() => closeAdditionalAlerts?.(alert.id)}
        >
          {alert.content}
        </Alert>
      ))}
    </Box>
  );
};

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

        const { message, threadId } = JSON.parse(init!.body as string);
        window.electron.chat.sendMessage(threadId, message);
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

const ChatArea: React.FC<ChatAreaProps> = ({ selectedRoomId }) => {
  const [loading, setLoading] = useState(false);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  // useChatからのエラーを表示するための状態
  const [additionalAlerts, setAdditionalAlerts] = useState<AlertMessage[]>([]);
  const { status: agentStatus } = useAgentStatus();

  const isAgentInitializing = agentStatus.state === 'initializing';

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

  const { messages, input, status, error, handleInputChange, handleSubmit } =
    useChat({
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

        // 初回メッセージ送信時にスレッドを作成
        // titleについてはここで、指定してもmemoryのオプションでgenerateTitleをtrueにしていた場合、「New Thread 2025-04-27T08:20:05.694Z」のようなタイトルが自動生成されてしまう
        if (selectedRoomId && request.messages.length === 1) {
          chatService.createThread(selectedRoomId, '');
        }

        // Return the structured body for your API route
        return {
          message: lastMessage?.content, // Send only the most recent message content/role
          threadId: selectedRoomId ?? undefined,
        };
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
          <MessageList messages={messages} loading={loading} status={status} />

          <Divider />

          {/* メッセージ入力 */}
          <MessageInput
            handleSubmit={handleSubmit}
            handleInputChange={handleInputChange}
            message={input}
            disabled={
              status === 'submitted' ||
              status === 'streaming' ||
              isAgentInitializing
            }
            placeholder={getPlaceholderText(status, isAgentInitializing)}
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
            チャットルームを選択してください
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ChatArea;
