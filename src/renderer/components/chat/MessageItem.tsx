import React, { forwardRef } from 'react';
import { Box, Typography, Paper, Avatar, Tooltip } from '@mui/material';
import { Person as PersonIcon, SmartToy as BotIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../../types';

interface MessageProps {
  message: ChatMessage;
}

const MessageItem = forwardRef<HTMLDivElement, MessageProps>(
  ({ message }, ref) => {
    const isUser = message.role === 'user';
    const date = new Date(message.createdAt);
    const formattedTime = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <Box
        ref={ref}
        sx={{
          display: 'flex',
          mb: 2,
          px: 2,
        }}
      >
        <Box
          sx={{
            mr: 2,
            mt: 0.5,
          }}
        >
          <Tooltip title={isUser ? 'ユーザー' : 'AI'}>
            <Avatar
              sx={{
                bgcolor: isUser ? 'primary.main' : 'secondary.main',
              }}
            >
              {isUser ? <PersonIcon /> : <BotIcon />}
            </Avatar>
          </Tooltip>
        </Box>

        <Box sx={{ maxWidth: '85%' }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              bgcolor: isUser ? 'primary.lighter' : 'grey.100',
              borderRadius: 2,
            }}
          >
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </Paper>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ ml: 1, mt: 0.5, display: 'block' }}
          >
            {formattedTime}
          </Typography>
        </Box>
      </Box>
    );
  },
);

MessageItem.displayName = 'MessageItem';

export default MessageItem;
