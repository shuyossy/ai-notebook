import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import MessageItem from './MessageItem';
import { ChatMessage } from '../../types';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  streamingMessage: string | null;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  streamingMessage,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが追加されたらスクロールする
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
      }}
      className="hidden-scrollbar"
    >
      {messages.length === 0 && !loading && !streamingMessage ? (
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            p: 4,
          }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            AIとのチャットを開始する
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ソースに関する質問や情報を入力してください
          </Typography>
        </Box>
      ) : (
        <>
          {/* 過去のメッセージ */}
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}

          {/* ストリーミング中のメッセージ */}
          {streamingMessage && (
            <MessageItem
              message={{
                id: 'streaming',
                roomId: messages.length > 0 ? messages[0].roomId : '',
                role: 'assistant',
                content: streamingMessage,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }}
            />
          )}

          {/* ローディング表示 */}
          {loading && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                my: 2,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          )}

          {/* 自動スクロール用の要素 */}
          <Box ref={bottomRef} />
        </>
      )}
    </Box>
  );
};

export default MessageList;
