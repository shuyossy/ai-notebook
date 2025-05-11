import React from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Badge,
  CircularProgress,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';

interface SidebarFooterProps {
  onSettingsClick: () => void;
  onOpenSourceList: () => void;
  sourceStatus: {
    processing: boolean;
    enabledCount: number;
  };
  settingsHasError: boolean;
}

function SidebarFooter({
  onSettingsClick,
  onOpenSourceList,
  sourceStatus,
  settingsHasError,
}: SidebarFooterProps) {
  const getBadgeContent = () => {
    if (sourceStatus.processing) {
      return (
        <CircularProgress
          size={12}
          thickness={4}
          sx={{ color: 'primary.main' }}
        />
      );
    }
    return sourceStatus.enabledCount >= 100
      ? '99+'
      : sourceStatus.enabledCount.toString();
  };

  return (
    <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Tooltip title="ソース一覧を表示">
          <Badge
            badgeContent={getBadgeContent()}
            overlap="circular"
            color={sourceStatus.processing ? 'default' : 'primary'}
            sx={{
              '& .MuiBadge-badge': {
                minWidth: '17px',
                height: '17px',
              },
            }}
          >
            <IconButton onClick={onOpenSourceList}>
              <AttachFileIcon />
            </IconButton>
          </Badge>
        </Tooltip>
        <Tooltip title="設定">
          <Badge
            badgeContent="!"
            color="error"
            invisible={!settingsHasError}
            sx={{
              '& .MuiBadge-badge': {
                minWidth: '17px',
                height: '17px',
              },
            }}
          >
            <IconButton onClick={onSettingsClick}>
              <SettingsIcon />
            </IconButton>
          </Badge>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default React.memo(SidebarFooter);
