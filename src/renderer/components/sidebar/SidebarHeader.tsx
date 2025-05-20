import React from 'react';
import { Box, Button } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

interface SidebarHeaderProps {
  onCreateRoom: () => void;
}

function SidebarHeader({ onCreateRoom }: SidebarHeaderProps) {
  return (
    <>
      {/* 新規チャットボタン */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'start' }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateRoom}
          // fullWidth
        >
          New Chat
        </Button>
      </Box>
    </>
  );
}

export default React.memo(SidebarHeader);
