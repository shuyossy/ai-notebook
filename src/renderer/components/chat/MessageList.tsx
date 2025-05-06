import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import MessageItem from './MessageItem';
import { ChatMessage } from '../../../main/types';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  status: 'error' | 'ready' | 'submitted' | 'streaming';
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  status,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  console.log('MessageList: ', messages);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        '& > *': {
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%',
        },
      }}
      className="hidden-scrollbar"
    >
      {messages.map((m) => {
        return (
          <Box key={m.id} mb={2}>
            <MessageItem message={m} />
          </Box>
        );
      })}

      {status === 'streaming' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            mt: 1,
          }}
        >
          <CircularProgress size={20} />
          <Box component="span" sx={{ ml: 1, fontSize: '0.875rem' }}>
            応答中…
          </Box>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      <Box ref={bottomRef} />
    </Box>
  );
};

export default MessageList;
