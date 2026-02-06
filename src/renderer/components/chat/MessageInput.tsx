import React, { useState, useCallback, ClipboardEvent } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Send as SendIcon,
  StopCircleOutlined as StopIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  InsertDriveFileOutlined as FileIcon,
} from '@mui/icons-material';

/* ---------- 型定義 ---------- */

export interface Attachment {
  file: File;
  /** プレビュー用の ObjectURL（画像の場合のみ。メモリリーク防止のため removeAttachment で revoke） */
  preview: string;
  /** 画像ファイルかどうか */
  isImage: boolean;
  /** ファイルパス（Electronダイアログで選択した場合） */
  path?: string;
}

interface MessageInputProps {
  handleSubmit: (e: React.FormEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  message: string;
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
  onStop?: () => void;
  attachments: Attachment[];
  /** ファイル選択ダイアログを開くコールバック */
  onOpenFileDialog: () => void;
  /** クリップボードから貼り付けた画像用 */
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (idx: number) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({
  handleSubmit,
  handleInputChange,
  message,
  disabled = false,
  placeholder = 'メッセージを入力...',
  isStreaming = false,
  onStop,
  attachments,
  onOpenFileDialog,
  onAddFiles,
  onRemoveAttachment,
}) => {
  const [isComposing, setIsComposing] = useState(false);

  /* ---------- クリップボード貼り付け ---------- */
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const files: File[] = [];
      Array.from(items).forEach((item) => {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && file.type.startsWith('image/')) files.push(file);
        }
      });
      if (files.length) onAddFiles(files);
    },
    [onAddFiles],
  );

  /* ---------- Enter キー送信（Shift+Enter で改行） ---------- */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  /* ---------- IME 制御 ---------- */
  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  /* ============================================================= */

  return (
    <Box sx={{ p: 2, width: '100%', maxWidth: '900px', mx: 'auto' }}>
      {/* 添付ファイルプレビュー ------------------------------------------------ */}
      {attachments.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 1,
            mb: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {attachments.map((att, idx) => (
            <Box
              key={idx}
              sx={{
                position: 'relative',
                width: 80,
                height: 80,
                borderRadius: 1,
                overflow: 'hidden',
                flexShrink: 0,
                ...(att.isImage
                  ? {}
                  : {
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'grey.100',
                      border: '1px solid',
                      borderColor: 'grey.300',
                    }),
              }}
              data-testid={att.isImage ? undefined : `file-attachment-${idx}`}
            >
              {att.isImage ? (
                /* 画像サムネイル */
                <Box
                  component="img"
                  src={att.preview}
                  alt={`attachment-${idx}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                /* 非画像ファイル：アイコン + ファイル名 */
                <>
                  <FileIcon sx={{ fontSize: 28, color: 'grey.600' }} />
                  <Typography
                    variant="caption"
                    sx={{
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      px: 0.5,
                      textAlign: 'center',
                    }}
                    title={att.file.name}
                  >
                    {att.file.name}
                  </Typography>
                </>
              )}
              {/* × ボタン */}
              <IconButton
                size="small"
                onClick={() => onRemoveAttachment(idx)}
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  bgcolor: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
                }}
                data-testid={`chat-remove-attachment-${idx}`}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Paper>
      )}

      {/* 入力欄 ----------------------------------------------------------- */}
      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={3}
        sx={{
          p: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 2,
        }}
      >
        {/* ファイル添付アイコン */}
        <Tooltip title="ファイルを添付">
          <span>
            <IconButton
              onClick={onOpenFileDialog}
              disabled={disabled}
              sx={{ alignSelf: 'center' }}
              data-testid="chat-attach-file-button"
            >
              <AttachFileIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* メインのテキストフィールド */}
        <TextField
          fullWidth
          multiline
          minRows={1}
          maxRows={6}
          placeholder={placeholder}
          variant="outlined"
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          disabled={disabled}
          slotProps={{
            input: {
              sx: { p: 1, '& fieldset': { border: 'none' } },
              endAdornment: (
                <InputAdornment position="end">
                  {isStreaming ? (
                    <IconButton
                      color="primary"
                      onClick={onStop}
                      data-testid="chat-stop-button"
                    >
                      <StopIcon />
                    </IconButton>
                  ) : (
                    <IconButton
                      color="primary"
                      type="submit"
                      disabled={
                        disabled || (!message.trim() && !attachments.length)
                      }
                      data-testid="chat-send-button"
                    >
                      <SendIcon />
                    </IconButton>
                  )}
                </InputAdornment>
              ),
            },
          }}
        />
      </Paper>
    </Box>
  );
};

export default MessageInput;
