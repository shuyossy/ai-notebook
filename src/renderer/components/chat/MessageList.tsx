import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { ChatMessage } from '@/types';
import MessageItem from './MessageItem';

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
  loadingMessage?: string;
  disableEdit?: boolean;
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
  loadingMessage = 'AIKATA作業中…',
  disableEdit = false,
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
              disableEdit={disableEdit}
            />
          </Box>
        );
      })}

      {(status === 'streaming' || status === 'submitted') && (
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
            {loadingMessage}
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
