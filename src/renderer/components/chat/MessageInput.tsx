import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Paper,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  sending?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'メッセージを入力...',
  sending = false,
}) => {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textFieldRef = useRef<HTMLDivElement>(null);

  // 送信ハンドラ
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !sending) {
      onSendMessage(message);
      setMessage('');
    }
  };

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

  // 高さの自動調整
  useEffect(() => {
    if (textFieldRef.current) {
      const element = textFieldRef.current.querySelector('textarea');
      if (element) {
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
      }
    }
  }, [message]);

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
          maxRows={4}
          placeholder={placeholder}
          variant="outlined"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          disabled={disabled || sending}
          ref={textFieldRef}
          InputProps={{
            sx: {
              p: 1,
              '& fieldset': { border: 'none' },
            },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  color="primary"
                  onClick={handleSubmit}
                  disabled={disabled || sending || !message.trim()}
                >
                  {sending ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Paper>
    </Box>
  );
};

export default MessageInput;
