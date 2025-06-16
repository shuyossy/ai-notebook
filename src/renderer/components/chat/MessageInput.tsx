import React, { useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Paper,
  InputAdornment,
} from '@mui/material';
import {
  Send as SendIcon,
  StopCircleOutlined as StopCircleOutlinedIcon,
} from '@mui/icons-material';

interface MessageInputProps {
  handleSubmit: (e: React.FormEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  message: string;
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
  onStop?: () => void;
}

const MessageInput: React.FC<MessageInputProps> = ({
  handleSubmit,
  handleInputChange,
  message,
  disabled = false,
  placeholder = 'メッセージを入力...',
  isStreaming = false,
  onStop,
}) => {
  const [isComposing, setIsComposing] = useState(false);

  // Enterキーで送信（Shift+Enterで改行）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // IME変換開始時のハンドラ
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  // IME変換確定時のハンドラ
  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  return (
    <Box sx={{ p: 2, width: '100%', maxWidth: '900px', mx: 'auto' }}>
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
          disabled={disabled}
          slotProps={{
            input: {
              sx: {
                p: 1,
                '& fieldset': { border: 'none' }, // フィールドセットの枠線を消す
              },
              endAdornment: (
                <InputAdornment position="end">
                  {/* 送信ボタンまたは送信中インジケーター */}
                  {isStreaming ? (
                    <IconButton
                      color="primary"
                      onClick={onStop}
                      data-testid="chat-stop-button"
                    >
                      <StopCircleOutlinedIcon />
                    </IconButton>
                  ) : (
                    <IconButton
                      color="primary"
                      onClick={handleSubmit}
                      disabled={disabled || !message.trim()}
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
