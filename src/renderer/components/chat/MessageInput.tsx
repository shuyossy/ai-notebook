import React, { useRef, useState, useCallback, ClipboardEvent } from 'react';
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
  ImageOutlined as ImageIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

/* ---------- 型定義 ---------- */

export interface Attachment {
  file: File;
  /** プレビュー用の ObjectURL（メモリリーク防止のため removeAttachment で revoke） */
  preview: string;
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
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveAttachment: (idx: number) => void;
  maxAttachments?: number;
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
  onAddFiles,
  onRemoveAttachment,
  maxAttachments = 3,
}) => {
  const [isComposing, setIsComposing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- ファイル選択ダイアログを開く ---------- */
  const openFileDialog = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

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
    <Box sx={{ p: 2 }}>
      {/* 添付画像プレビュー ------------------------------------------------ */}
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
              }}
            >
              {/* サムネイル */}
              <Box
                component="img"
                src={att.preview}
                alt={`attachment-${idx}`}
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
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
        {/* 画像アイコン & Hidden input */}
        <Tooltip title="画像を添付 (最大3枚)">
          <span>
            <IconButton
              onClick={openFileDialog}
              disabled={attachments.length >= maxAttachments || disabled}
              sx={{ alignSelf: 'center' }}
            >
              <ImageIcon />
            </IconButton>
          </span>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) onAddFiles(e.target.files);
            // 同じファイルを連続で選択したときの onChange 発火のためリセット
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />

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

      {/* 画像枚数が上限の場合の注意書き */}
      {attachments.length >= maxAttachments && (
        <Typography variant="caption" color="error">
          添付は最大 {maxAttachments} 枚までです
        </Typography>
      )}
    </Box>
  );
};

export default MessageInput;
