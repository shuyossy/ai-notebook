import React, { useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  Button,
  Paper,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  Stack,
  Divider,
} from '@mui/material';
import Backdrop from '@mui/material/Backdrop';
import { RetryMode } from '@/types';

interface RetryModeSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (retryMode: RetryMode) => void;
  disabled?: boolean;
}

const RetryModeSelectionModal: React.FC<RetryModeSelectionModalProps> = ({
  open,
  onClose,
  onSubmit,
  disabled = false,
}) => {
  const [retryMode, setRetryMode] = useState<RetryMode>('uncompleted-only');

  const handleSubmit = () => {
    onSubmit(retryMode);
  };

  const handleClose = () => {
    if (!disabled) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeAfterTransition
      slots={{ backdrop: Backdrop }}
      slotProps={{
        backdrop: {
          timeout: 500,
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          minWidth: 500,
          maxWidth: '90%',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          outline: 'none',
        }}
      >
        <Paper elevation={0} sx={{ p: 3 }}>
          {/* ヘッダー */}
          <Typography variant="h5" component="h2" gutterBottom>
            リトライモードの選択
          </Typography>
          <Divider sx={{ mb: 3 }} />

          {/* 説明文 */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            レビューを再実行するチェックリストを選択してください
          </Typography>

          {/* リトライモード選択 */}
          <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
            <RadioGroup
              value={retryMode}
              onChange={(e) => setRetryMode(e.target.value as RetryMode)}
            >
              <FormControlLabel
                value="uncompleted-only"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1">
                      レビュー未済のチェックリストのみ
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      評価が未完了のチェックリストのみを再実行します
                    </Typography>
                  </Box>
                }
                sx={{ mb: 2 }}
              />
              <FormControlLabel
                value="all"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1">全てのチェックリスト</Typography>
                    <Typography variant="caption" color="text.secondary">
                      全てのチェックリストを再実行します（既存の評価は削除されます）
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>

          {/* アクションボタン */}
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={handleClose}
              disabled={disabled}
            >
              キャンセル
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={disabled}
            >
              リトライ実行
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Modal>
  );
};

export default RetryModeSelectionModal;
