import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  Settings as SettingsIcon,
  FormatListBulleted as FormatListBulletedIcon,
} from '@mui/icons-material';

interface SidebarFooterProps {
  onSettingsClick: () => void;
  onOpenSourceList: () => void;
}

function SidebarFooter({
  onSettingsClick,
  onOpenSourceList,
}: SidebarFooterProps) {
  return (
    <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Tooltip title="ソース一覧を表示">
          <IconButton onClick={onOpenSourceList}>
            <FormatListBulletedIcon />
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
