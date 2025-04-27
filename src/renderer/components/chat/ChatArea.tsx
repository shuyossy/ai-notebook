import React, { useEffect } from 'react';
import { Box, Divider, Typography, LinearProgress } from '@mui/material';
import { useChat } from '@ai-sdk/react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { chatService } from '../../services/chatService';

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
  sending: boolean;
  setSending: (sending: boolean) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  selectedRoomId,
  sending,
  setSending,
}) => {
  const { messages, input, status, error, handleInputChange, handleSubmit } =
    useChat({
      api: '/api/chat',
      fetch: customFetch,
      streamProtocol: 'data',
      experimental_prepareRequestBody: (request) => {
        // Ensure messages array is not empty and get the last message
        const lastMessage =
          request.messages.length > 0
            ? request.messages[request.messages.length - 1]
            : null;

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

  // 親コンポーネントと“送信中”状態を同期
  useEffect(() => {
    setSending(status === 'submitted' || status === 'streaming');
  }, [status, setSending]);

  const streaming = status === 'streaming';

  return (
    <Box
      sx={{
        width: 'calc(100% - 280px)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
      }}
    >
      {selectedRoomId ? (
        <>
          {/* ステータスバー */}
          {streaming && <LinearProgress />}

          {/* メッセージリスト */}
          <MessageList messages={messages} loading={sending} />

          <Divider />

          {/* メッセージ入力 */}
          <MessageInput
            handleSubmit={handleSubmit}
            handleInputChange={handleInputChange}
            message={input}
            disabled={status !== 'ready'}
            sending={sending}
            placeholder={
              // eslint-disable-next-line
              status === 'submitted'
                ? 'メッセージ送信中…'
                : status === 'streaming'
                  ? 'AIが応答中…'
                  : 'メッセージを入力…'
            }
          />

          {error && (
            <Typography color="error" sx={{ p: 1, textAlign: 'center' }}>
              エラーが発生しました: {error.message}
            </Typography>
          )}
        </>
      ) : (
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: 'background.paper',
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
