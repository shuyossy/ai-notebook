import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import MessageItem from './MessageItem';
import { ChatMessage } from '../../../main/types';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  status: 'error' | 'ready' | 'submitted' | 'streaming';
  editContent: string;
  disabled: boolean;
  onEditStart: (messageId: string) => void;
  editingMessageId: string;
  onEditSubmit: () => void;
  onEditContentChange: (ontent: string) => void;
  onEditCancel: () => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  status,
  editContent,
  disabled,
  onEditStart,
  editingMessageId,
  onEditSubmit,
  onEditContentChange,
  onEditCancel,
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
            <MessageItem
              message={m}
              editContent={editContent}
              disabled={disabled}
              isEditing={editingMessageId === m.id}
              onEditStart={onEditStart}
              onEditSubmit={onEditSubmit}
              onEditContentChange={onEditContentChange}
              onEditCancel={onEditCancel}
            />
          </Box>
        );
      })}

      {status === 'streaming' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mt: 1,
          }}
        >
          <CircularProgress size={24} />
          <Box component="span" sx={{ ml: 1 }}>
            AIKATA作業中…
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
