import React, { forwardRef, memo } from 'react';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import copy from 'copy-to-clipboard';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
// @ts-ignore
import type { Components } from 'react-markdown';
import type { ChatMessage } from '../../../main/types';

// ──────── Markdown レンダラー設定 ────────

type CodeProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

// コードブロックのテーマ設定
const customStyle = {
  ...materialLight,
  'pre[class*="language-"]': {
    ...materialLight['pre[class*="language-"]'],
    backgroundColor: '#f5f5f5',
  },
  'code[class*="language-"]': {
    backgroundColor: '#f5f5f5',
  },
  'span[class*="token"]': {
    backgroundColor: 'transparent',
  },
};

const CodeBlockRenderer: React.FC<CodeProps> = ({
  inline,
  className,
  children,
}) => {
  const text = String(children ?? '').replace(/\n$/, '');
  const langMatch = /language-(\w+)/.exec(className || '');
  const lang = langMatch?.[1] ?? '';

  if (inline) {
    return (
      <Box
        component="code"
        sx={{
          px: 1,
          py: 0.5,
          bgcolor: 'grey.100',
          borderRadius: 1,
          fontSize: '0.875em',
        }}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', mb: 2 }}>
      <Tooltip title="コードをコピー">
        <IconButton
          size="small"
          onClick={() => copy(text)}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: 'background.paper',
            zIndex: 1,
          }}
          aria-label="コピー"
        >
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <SyntaxHighlighter
        style={customStyle as unknown as any}
        language={lang}
        customStyle={{
          backgroundColor: '#f5f5f5',
          padding: '1em',
          borderRadius: '0.25em',
        }}
        codeTagProps={{ style: { backgroundColor: '#f5f5f5' } }}
      >
        {text}
      </SyntaxHighlighter>
    </Box>
  );
};

const TableRenderers = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <TableContainer component={Paper} elevation={0} sx={{ my: 2 }}>
      <Table size="small">{children}</Table>
    </TableContainer>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <TableHead sx={{ bgcolor: 'grey.200' }}>{children}</TableHead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <TableBody>{children}</TableBody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <TableRow>{children}</TableRow>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <TableCell sx={{ fontWeight: 'bold', borderColor: 'grey.300' }}>
      {children}
    </TableCell>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <TableCell sx={{ borderColor: 'grey.300' }}>{children}</TableCell>
  ),
};

const ImageRenderer: React.FC<{ src?: string; alt?: string }> = ({
  src,
  alt,
}) => (
  <Box
    component="img"
    src={src}
    alt={alt}
    sx={{ maxWidth: '100%', borderRadius: 1, my: 1 }}
  />
);

const ParagraphRenderer: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <Typography
    variant="body1"
    component="p"
    sx={{ mt: 1, whiteSpace: 'pre-wrap' }}
  >
    {children}
  </Typography>
);

const markdownComponents = {
  code: CodeBlockRenderer,
  img: ImageRenderer,
  p: ParagraphRenderer,
  ...TableRenderers,
} as unknown as Components;

interface MessageProps {
  message: ChatMessage;
}

const MessageItem = forwardRef<HTMLDivElement, MessageProps>(
  ({ message }, ref) => {
    const isUser = message.role === 'user';
    const date = message.createdAt ? new Date(message.createdAt) : new Date();
    const time = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <Box
        ref={ref}
        sx={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          mb: 2,
          px: 2,
        }}
      >
        <Box sx={{ maxWidth: isUser ? '70%' : '100%', textAlign: 'left' }}>
          <Paper
            elevation={isUser ? 1 : 0}
            sx={{
              p: 2,
              bgcolor: isUser ? 'grey.100' : 'background.paper',
              borderRadius: 2,
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </Paper>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.5, display: 'block' }}
          >
            {time}
          </Typography>
        </Box>
      </Box>
    );
  },
);

MessageItem.displayName = 'MessageItem';
export default memo(MessageItem);
