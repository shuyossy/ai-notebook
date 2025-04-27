import React, { useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Paper,
  InputAdornment,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

interface MessageInputProps {
  handleSubmit: (e: React.FormEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  message: string;
  disabled?: boolean;
  placeholder?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
  handleSubmit,
  handleInputChange,
  message,
  disabled = false,
  placeholder = 'メッセージを入力...',
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
    <Box sx={{ p: 2 }}>
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
                  <IconButton
                    color="primary"
                    onClick={handleSubmit}
                    disabled={disabled || !message.trim()}
                  >
                    <SendIcon />
                  </IconButton>
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
