import React, { forwardRef, memo } from 'react';
import { Box, Typography, Paper, Avatar, Tooltip } from '@mui/material';
import { Person as PersonIcon, SmartToy as BotIcon } from '@mui/icons-material';
// @ts-ignore
import Markdown from 'react-markdown';
import { ChatMessage } from '../../types';

interface MessageProps {
  message: ChatMessage;
}

interface MarkdownComponentProps {
  children: React.ReactNode;
}

// カスタムコンポーネントを外で定義
function CodeBlock({ children }: MarkdownComponentProps) {
  return (
    <Box
      component="code"
      sx={{
        whiteSpace: 'pre-wrap',
        display: 'inline-block',
        background: 'rgba(0, 0, 0, 0.04)',
        padding: '2px 4px',
        borderRadius: 1,
        fontSize: '0.875em',
      }}
    >
      {children}
    </Box>
  );
}

function MarkdownParagraph({ children }: MarkdownComponentProps) {
  return (
    <Typography variant="body1" component="p" sx={{ margin: 0 }}>
      {children}
    </Typography>
  );
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
            <Box
              sx={{
                // マークダウン要素のスタイル調整
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                  margin: '0.15rem',
                  fontWeight: 'bold',
                  lineHeight: 1.2,
                },
                '& ul, & ol': {
                  margin: 0,
                  padding: 0,
                  paddingLeft: '1rem',
                  '& ul, & ol': {
                    marginLeft: '0.5rem',
                  },
                },
                '& li': {
                  margin: 0,
                  padding: 0,
                },
                '& p': {
                  margin: 0,
                  padding: 0,
                },
                '& pre': {
                  background: 'rgba(0, 0, 0, 0.04)',
                  padding: '0.25rem 0.5rem',
                  borderRadius: 1,
                  overflowX: 'auto',
                  margin: 0,
                  '& code': {
                    whiteSpace: 'pre',
                  },
                },
                '& :not(pre) > code': {
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(0, 0, 0, 0.04)',
                  padding: '2px 4px',
                  borderRadius: 1,
                  fontSize: '0.875em',
                },
                '& blockquote': {
                  margin: 0,
                  padding: '0.25rem 0.5rem',
                  borderLeft: '3px solid rgba(0, 0, 0, 0.1)',
                },
                // 見出しのサイズ調整
                '& h1': { fontSize: '1.2em' },
                '& h2': { fontSize: '1.1em' },
                '& h3, & h4, & h5, & h6': { fontSize: '1em' },
                // 段落間の余白調整
                '& p + p': { marginTop: '0.25rem' },
                '& pre + p, & p + pre': { marginTop: '0.25rem' },
              }}
            >
              <Markdown
                components={{
                  p: MarkdownParagraph as any,
                  code: CodeBlock as any,
                }}
              >
                {message.content}
              </Markdown>
            </Box>
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

export default memo(MessageItem);
