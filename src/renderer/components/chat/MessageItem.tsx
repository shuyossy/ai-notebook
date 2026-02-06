import React, { memo, forwardRef, useState, useEffect, useRef } from 'react';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
import EditIcon from '@mui/icons-material/Edit';
// @ts-ignore
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import copy from 'copy-to-clipboard';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
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
  TextField,
  Button,
  Chip,
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
// @ts-ignore
import type { Components } from 'react-markdown';
import type { ChatMessage } from '@/types';
import { TOOL_NAME_DISPLAY_MAP } from '../../../mastra/tools/toolDisplayConfig';
import FileContentViewerDialog from './FileContentViewerDialog';

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

  if (!lang.trim() || inline) {
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
} as Components;

// ─────────────── ファイル添付表示のヘルパー関数 ───────────────

/**
 * Data URLからテキスト内容をデコードする
 * エンコード時に btoa(unescape(encodeURIComponent(content))) を使用しているため、
 * デコード時は逆順でUTF-8文字列を復元する
 */
const decodeDataUrlContent = (dataUrl: string): string => {
  try {
    // data:text/plain;base64,XXXXX 形式を想定
    const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (base64Match) {
      // base64デコード後、UTF-8としてデコード
      const binaryString = atob(base64Match[1]);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(bytes);
    }
    // data:text/plain,XXXXX 形式
    const plainMatch = dataUrl.match(/^data:[^,]+,(.+)$/);
    if (plainMatch) {
      return decodeURIComponent(plainMatch[1]);
    }
    return dataUrl;
  } catch {
    return dataUrl;
  }
};

/**
 * コンテンツタイプが画像かどうかを判定
 */
const isImageContentType = (contentType?: string): boolean => {
  return contentType?.startsWith('image/') ?? false;
};

// ─────────────── ファイル添付チップコンポーネント ───────────────

interface FileAttachmentChipProps {
  name: string;
  onClick: () => void;
}

const FileAttachmentChip: React.FC<FileAttachmentChipProps> = ({
  name,
  onClick,
}) => (
  <Chip
    icon={<InsertDriveFileOutlinedIcon />}
    label={name}
    onClick={onClick}
    size="small"
    variant="outlined"
    sx={{
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: 'action.hover',
      },
    }}
  />
);

// ─────────────── ai-sdk・UIMessageのpartsレンダー用コンポーネント ───────────────

interface RenderPartProps {
  part: NonNullable<ChatMessage['parts']>[number];
  attachments?: ChatMessage['experimental_attachments'];
  onFileClick?: (name: string, content: string) => void;
}

const RenderPart: React.FC<RenderPartProps> = ({
  part,
  attachments,
  onFileClick,
}) => {
  if (!part) return null;
  switch (part.type) {
    case 'text': {
      return (
        <Box sx={{ mb: 2, py: 2 }}>
          {attachments && attachments.length > 0 && (
            <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {attachments.map((att, idx) => {
                const isImage = isImageContentType(att.contentType);
                if (isImage) {
                  return (
                    <Box
                      key={idx}
                      sx={{ display: 'flex', justifyContent: 'center' }}
                    >
                      <Box
                        component="img"
                        src={att.url}
                        alt={att.name || `att-${idx}`}
                        sx={{
                          maxWidth: '100%',
                          maxHeight: 300,
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                  );
                }
                // 非画像ファイル: クリック可能なチップとして表示
                return (
                  <FileAttachmentChip
                    key={idx}
                    name={att.name || `file-${idx}`}
                    onClick={() => {
                      const content = decodeDataUrlContent(att.url ?? '');
                      onFileClick?.(att.name || `file-${idx}`, content);
                    }}
                  />
                );
              })}
            </Box>
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {part.text}
          </ReactMarkdown>
        </Box>
      );
    }
    case 'tool-invocation': {
      const ti = part.toolInvocation;
      // if (ti.toolName === 'sourceListTool') return null; // 任意で除外
      if (ti.toolName === 'updateWorkingMemory') {
        return (
          <Box key={ti.toolCallId} mb={1}>
            <Typography variant="caption" color="text.secondary">
              メモリ更新中
            </Typography>
          </Box>
        );
      }

      return (
        <Accordion sx={{ width: '100%' }} key={ti.toolCallId}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {ti.toolName === 'documentQueryTool' ||
              ti.toolCallId.startsWith('reviewChatResearchDocument-') ? (
                <SearchIcon sx={{ mr: 1 }} />
              ) : (
                <SmartToyOutlinedIcon sx={{ mr: 1 }} />
              )}
              {ti.toolName === 'documentQueryTool'
                ? `ドキュメント検索：${
                    Array.isArray(ti.args.documentQueries)
                      ? [
                          ...new Set(
                            ti.args.documentQueries.map(
                              // @ts-ignore
                              (item) => item.path?.split(/[\/\\]+/).pop() || '',
                            ),
                          ),
                        ]
                          .filter(Boolean)
                          .join('・')
                      : ''
                  }`
                : TOOL_NAME_DISPLAY_MAP[ti.toolName] || `MCP: ${ti.toolName}`}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box
              p={1}
              sx={{
                bgcolor: 'grey.100',
                borderRadius: 1,
                whiteSpace: 'pre-wrap',
              }}
            >
              {`Args: ${JSON.stringify(ti.args, null, 2)}\n`}
              {
                // eslint-disable-next-line
                ti.state === 'call'
                  ? '実行中...'
                  : ti.state === 'result'
                    ? `Result: ${JSON.stringify(ti.result, null, 2)}`
                    : ''
              }
            </Box>
          </AccordionDetails>
        </Accordion>
      );
    }
    case 'reasoning': {
      return (
        <Typography
          variant="caption"
          sx={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}
        >
          {part.reasoning}
        </Typography>
      );
    }
    /* StepStartUIPart, FileUIPart, SourceUIPart なども同様に分岐 */

    default:
      return null;
  }
};

// ─────────────── メインコンポーネント ───────────────

interface MessageProps {
  message: ChatMessage;
  editContent: string;
  disabled: boolean;
  onEditSubmit: () => void;
  isEditing: boolean;
  onEditStart: (messageId: string) => void;
  onEditContentChange: (content: string) => void;
  onEditCancel: () => void;
  disableEdit?: boolean;
}

const MessageItem = forwardRef<HTMLDivElement, MessageProps>(
  (
    {
      message,
      editContent,
      disabled,
      onEditSubmit,
      isEditing,
      onEditStart,
      onEditCancel,
      onEditContentChange,
      disableEdit = false,
    },
    ref,
  ) => {
    const isUser = message.role === 'user';

    // ファイル内容表示ダイアログの状態
    const [fileDialogOpen, setFileDialogOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<{
      name: string;
      content: string;
    }>({ name: '', content: '' });

    // ファイルクリック時のハンドラ
    const handleFileClick = (name: string, content: string) => {
      setSelectedFile({ name, content });
      setFileDialogOpen(true);
    };

    return (
      <>
        <Fade in timeout={300}>
          <Box
            ref={ref}
            sx={{
              display: 'flex',
              justifyContent: isUser ? 'flex-end' : 'flex-start',
              px: 2,
            }}
          >
            <Box
              sx={{
                maxWidth: isUser && !isEditing ? '70%' : '100%',
                width: isUser && !isEditing ? undefined : '100%',
                textAlign: 'left',
                ...(!disableEdit && { '&:hover .editBtn': { opacity: 1 } }),
              }}
            >
              <Paper
                elevation={isUser ? 1 : 0}
                sx={{
                  px: 2,
                  bgcolor: isUser ? 'grey.100' : 'background.paper',
                  borderRadius: 2,
                  position: 'relative',
                }}
              >
                {isUser &&
                  !message.experimental_attachments &&
                  !isEditing &&
                  !disableEdit && (
                    <IconButton
                      className="editBtn"
                      size="small"
                      onClick={() => {
                        onEditStart?.(message.id);
                        onEditContentChange(message.content ?? '');
                      }}
                      sx={{
                        position: 'absolute',
                        right: -36,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        bgcolor: 'background.paper',
                      }}
                      data-testid={`edit-message-button-${message.id}`}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                {/* eslint-disable-next-line */}
                {isEditing && !message.experimental_attachments && isUser ? (
                  <Box sx={{ p: 1, width: '100%' }}>
                    <TextField
                      fullWidth
                      multiline
                      variant="standard" // アンダーラインのみのスタイルに
                      slotProps={{
                        input: {
                          disableUnderline: true, // アンダーラインも消す
                        },
                      }}
                      value={editContent}
                      onChange={(e) => onEditContentChange(e.target.value)}
                      sx={{ mb: 2 }}
                      data-testid={`edit-message-input-${message.id}`}
                    />
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 1,
                      }}
                    >
                      <Button
                        size="small"
                        onClick={onEditCancel}
                        variant="contained"
                        sx={{
                          backgroundColor: 'white',
                          color: 'black',
                        }}
                        data-testid={`edit-message-cancel-button-${message.id}`}
                      >
                        キャンセル
                      </Button>
                      <Button
                        size="small"
                        onClick={onEditSubmit}
                        variant="contained"
                        disabled={disabled || !editContent?.trim()}
                        sx={{
                          backgroundColor: 'black',
                          color: 'white',
                        }}
                        data-testid={`edit-message-send-button-${message.id}`}
                      >
                        送信
                      </Button>
                    </Box>
                  </Box>
                ) : message.parts?.length ? (
                  message.parts.map((p, idx) => (
                    <RenderPart
                      key={
                        p.type === 'tool-invocation'
                          ? p.toolInvocation.toolCallId
                          : `${p.type}-${message.id}-${idx}`
                      }
                      part={p}
                      attachments={message.experimental_attachments}
                      onFileClick={handleFileClick}
                    />
                  ))
                ) : (
                  <RenderPart
                    part={{ type: 'text', text: message.content ?? '' }}
                    attachments={message.experimental_attachments}
                    onFileClick={handleFileClick}
                  />
                )}
              </Paper>
            </Box>
          </Box>
        </Fade>

        {/* ファイル内容表示ダイアログ */}
        <FileContentViewerDialog
          open={fileDialogOpen}
          onClose={() => setFileDialogOpen(false)}
          fileName={selectedFile.name}
          content={selectedFile.content}
        />
      </>
    );
  },
);

MessageItem.displayName = 'MessageItem';
export default memo(MessageItem);
