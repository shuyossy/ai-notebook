import React, { useState } from 'react';
import {
  Button,
  TextField,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import Modal from '../common/Modal';
import { ChatRoom } from '../../types';
import { chatService } from '../../services/chatService';

interface CreateChatRoomModalProps {
  open: boolean;
  onClose: () => void;
  onRoomCreated: (room: ChatRoom) => void;
}

const CreateChatRoomModal: React.FC<CreateChatRoomModalProps> = ({
  open,
  onClose,
  onRoomCreated,
}) => {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // モーダルが開かれたときにフォームをリセット
  React.useEffect(() => {
    if (open) {
      setTitle('');
      setError(null);
    }
  }, [open]);

  // チャットルーム作成
  const handleCreate = async () => {
    if (!title.trim()) {
      setError('タイトルを入力してください');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const newRoom = await chatService.createChatRoom(title);
      onRoomCreated(newRoom);
      onClose();
    } catch (err) {
      setError(`チャットルームの作成に失敗しました: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  };

  // モーダルのアクションボタン
  const actions = (
    <>
      <Button onClick={onClose} disabled={creating}>
        キャンセル
      </Button>
      <Button
        onClick={handleCreate}
        variant="contained"
        color="primary"
        disabled={creating || !title.trim()}
        startIcon={creating ? <CircularProgress size={16} /> : null}
      >
        作成
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新規チャットルーム"
      actions={actions}
    >
      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          label="チャットルーム名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={creating}
          error={!!error}
          helperText={error}
          autoFocus
          margin="normal"
          variant="outlined"
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          AIとのチャットルームを作成します。ソースに基づいた質問や情報を入力できます。
        </Typography>
      </Box>
    </Modal>
  );
};

export default CreateChatRoomModal;
