import React, { memo, forwardRef, useState, useEffect, useRef } from 'react';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
  Fade,
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
// @ts-ignore
import type { Components } from 'react-markdown';
import type { ChatMessage } from '../../../main/types';

// ─────────────── Mermaid 図レンダラー ───────────────
type MermaidProps = { chart: string };

const MermaidDiagram: React.FC<MermaidProps> = ({ chart }) => {
  // SVG 文字列を保持するステート。変数名を svgContent に変更して衝突回避
  const [svgContent, setSvgContent] = useState<string>('');

  // 安全な ID を初回レンダリング時に一度だけ生成
  const idRef = useRef<string>(
    // 日時＋ランダム文字列を結合し、CSS セレクタで使えない文字を除去
    `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '',
    ),
  );

  useEffect(() => {
    let isMounted = true;

    (async () => {
      // クライアント側でのみ mermaid をロード
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
      });

      try {
        // destructure 時に名前を変える
        const { svg: generatedSvg } = await mermaid.render(
          idRef.current,
          chart,
        );
        if (isMounted) {
          setSvgContent(generatedSvg);
        }
      } catch (error) {
        console.error('Mermaid render failed', error);
        if (isMounted) {
          setSvgContent(
            `<pre style="color:red;white-space:pre-wrap">Mermaid render error:\n${String(
              error,
            )}</pre>`,
          );
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  return (
    <Box
      sx={{
        width: '100%',
        overflowX: 'auto',
        my: 2,
        display: 'flex',
        justifyContent: 'center',
        '& svg': { maxWidth: '100%' },
      }}
      // dangerouslySetInnerHTML で SVG を描画
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};

// ─────────────── CodeProps 型 ───────────────

type CodeProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

// ─────────────── コードレンダラー ───────────────
//
// language-mermaid の場合は MermaidDiagram に委ねる
//
const CodeBlockRenderer: React.FC<CodeProps> = ({
  inline,
  className,
  children,
}) => {
  const text = String(children ?? '').replace(/\n$/, '');
  const langMatch = /language-(\w+)/.exec(className || '');
  const lang = langMatch?.[1] ?? '';
  // コピー表示制御
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Mermaid ブロックを検知したら専用レンダラーへ
  if (!inline && lang === 'mermaid') {
    return <MermaidDiagram chart={text} />;
  }

  if (inline) {
    // インラインコード
    return (
      <Box
        component="code"
        sx={{
          px: 1,
          py: 0.5,
          bgcolor: 'grey.100',
          borderRadius: 1,
          fontSize: '0.925em',
        }}
      >
        {children}
      </Box>
    );
  }

  // ブロックコードは SyntaxHighlighter へ
  return (
    <Box component="pre" sx={{ position: 'relative', mb: 2, m: 0, p: 0 }}>
      {/* コピーボタン */}
      <Tooltip title={copied ? 'コピーしました' : 'コードをコピー'} arrow>
        <IconButton
          size="small"
          onClick={() => {
            copy(text);
            setCopied(true);
          }}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: 'background.paper',
            zIndex: 1,
          }}
          aria-label="コードをコピー"
        >
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* ハイライト部分 */}
      <SyntaxHighlighter
        style={oneLight}
        language={lang}
        customStyle={{
          backgroundColor: '#f5f5f5',
          padding: '1em',
          borderRadius: '0.25em',
          fontSize: '0.925em',
        }}
        codeTagProps={{ style: { backgroundColor: 'inherit' } }}
      >
        {text}
      </SyntaxHighlighter>
    </Box>
  );
};

// ─────────────── 段落レンダラー ───────────────

const ParagraphRenderer: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <Typography
    variant="body1"
    component="div"
    sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
  >
    {children}
  </Typography>
);

// ─────────────── テーブル＆画像レンダラー ───────────────

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
    loading="lazy"
    sx={{ maxWidth: '100%', borderRadius: 1, my: 1 }}
  />
);

// ─────────────── Markdown 設定 ───────────────

const markdownComponents = {
  code: CodeBlockRenderer,
  img: ImageRenderer,
  p: ParagraphRenderer,
  ...TableRenderers,
} as unknown as Components;

// ─────────────── メインコンポーネント ───────────────

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
      <Fade in timeout={300}>
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
      </Fade>
    );
  },
);

MessageItem.displayName = 'MessageItem';
export default memo(MessageItem);
