import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface SidebarFooterProps {
  onSettingsClick: () => void;
  onReloadSources: () => void;
}

function SidebarFooter({
  onSettingsClick,
  onReloadSources,
}: SidebarFooterProps) {
  return (
    <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Tooltip title="ソースを再読み込み">
          <IconButton onClick={onReloadSources}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="設定">
          <IconButton onClick={onSettingsClick}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default React.memo(SidebarFooter);
