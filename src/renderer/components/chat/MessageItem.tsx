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
  Avatar,
  Tooltip,
  IconButton,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import {
  Person as PersonIcon,
  SmartToy as BotIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
// @ts-ignore
import type { Components } from 'react-markdown';
import type { ChatMessage } from '../../../main/types';

// ── Markdown 用レンダラをファイルトップに分離 ──

// コードブロック＆インラインコード
type CodeProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
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
    // インラインコード
    return (
      <Box
        component="code"
        sx={{
          px: '4px',
          py: '2px',
          bgcolor: 'rgba(0,0,0,0.04)',
          borderRadius: 1,
          fontSize: '0.875em',
        }}
      >
        {children}
      </Box>
    );
  }

  // ブロックコード：シンタックスハイライト＋コピー
  return (
    <Box sx={{ position: 'relative', mb: 2 }}>
      <IconButton
        size="small"
        onClick={() => copy(text)}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          bgcolor: 'background.paper',
        }}
        aria-label="コードをコピー"
      >
        <CopyIcon fontSize="small" />
      </IconButton>
      <SyntaxHighlighter
        style={materialLight as unknown as any}
        language={lang}
        PreTag="div"
      >
        {text}
      </SyntaxHighlighter>
    </Box>
  );
};

// テーブル周り
const TableRenderers = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <TableContainer component={Paper} elevation={0} sx={{ my: 1 }}>
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

// 画像
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

// 段落
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

// ReactMarkdown に渡す components マップ（型キャスト付き）
const markdownComponents = {
  code: CodeBlockRenderer,
  img: ImageRenderer,
  p: ParagraphRenderer,
  ...TableRenderers,
} as unknown as Components;

// ── MessageItem 本体 ──
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
        {/* アバター */}
        <Box sx={{ mr: isUser ? 0 : 2, ml: isUser ? 2 : 0, mt: 0.5 }}>
          <Tooltip title={isUser ? 'ユーザー' : 'AI'}>
            <Avatar
              sx={{ bgcolor: isUser ? 'primary.main' : 'secondary.main' }}
            >
              {isUser ? <PersonIcon /> : <BotIcon />}
            </Avatar>
          </Tooltip>
        </Box>

        {/* メッセージバブル */}
        <Box sx={{ maxWidth: '85%', textAlign: isUser ? 'right' : 'left' }}>
          <Paper
            elevation={1}
            sx={{
              p: 2,
              bgcolor: isUser ? 'primary.lighter' : 'grey.100',
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
