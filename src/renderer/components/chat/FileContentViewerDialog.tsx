import React from 'react';
import { Box, Typography } from '@mui/material';
import Modal from '../common/Modal';

export interface FileContentViewerDialogProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  content: string;
}

/**
 * ファイル添付の内容を表示するダイアログ
 */
const FileContentViewerDialog: React.FC<FileContentViewerDialogProps> = ({
  open,
  onClose,
  fileName,
  content,
}) => {
  return (
    <Modal open={open} onClose={onClose} title={fileName} maxWidth="md">
      <Box
        sx={{
          maxHeight: '60vh',
          overflow: 'auto',
          backgroundColor: 'grey.50',
          borderRadius: 1,
          p: 2,
        }}
      >
        <Typography
          component="pre"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            m: 0,
          }}
        >
          {content}
        </Typography>
      </Box>
    </Modal>
  );
};

export default FileContentViewerDialog;
