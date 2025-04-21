import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

interface SidebarHeaderProps {
  onCreateRoom: () => void;
}

function SidebarHeader({ onCreateRoom }: SidebarHeaderProps) {
  return (
    <>
      {/* ヘッダー */}
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          MyPedia
        </Typography>
      </Box>

      {/* 新規チャットボタン */}
      <Box sx={{ px: 2, mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateRoom}
          fullWidth
        >
          新規チャット
        </Button>
      </Box>
    </>
  );
}

export default React.memo(SidebarHeader);
