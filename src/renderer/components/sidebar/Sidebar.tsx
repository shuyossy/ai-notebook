import React, { useState, useCallback } from 'react';
import { Box, Divider, AlertColor } from '@mui/material';
import SourceListModal from '../common/SourceListModal';
import SettingsModal from '../common/SettingsModal';
import SidebarHeader from './SidebarHeader';
import SidebarFooter from './SidebarFooter';

interface SidebarProps {
  onReloadSources: () => void;
  showSnackbar: (message: string, severity: AlertColor) => void;
  children?: React.ReactNode;
}

function Sidebar({
  onReloadSources,
  showSnackbar,
  children = null,
}: SidebarProps) {
  const [isSourceListOpen, setIsSourceListOpen] = useState(false);
  const [settingsHasError, setSettingsHasError] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<{
    processing: boolean;
    enabledCount: number;
  }>({ processing: false, enabledCount: 0 });

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const onSettingsUpdated = useCallback(() => {
    // 設定更新完了時の処理
    showSnackbar('設定を更新しました', 'success');
  }, [showSnackbar]);

  // 設定モーダルを開く
  const handleSettingsClick = () => {
    setIsSettingsModalOpen(true);
  };

  return (
    <Box
      sx={{
        width: 280,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <SidebarHeader />

      {/* メイン部分 */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6,
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,.2)',
            borderRadius: 3,
          },
        }}
        className="hidden-scrollbar"
      >
        {children}
      </Box>

      <SidebarFooter
        onSettingsClick={handleSettingsClick}
        onOpenSourceList={() => setIsSourceListOpen(true)}
        sourceStatus={sourceStatus}
        settingsHasError={settingsHasError}
      />

      {/* ソース一覧モーダル */}
      <SourceListModal
        open={isSourceListOpen}
        processing={sourceStatus.processing}
        onClose={() => setIsSourceListOpen(false)}
        onReloadSources={onReloadSources}
        onStatusUpdate={setSourceStatus}
        showSnackbar={showSnackbar}
      />

      {/* 設定モーダル */}
      <SettingsModal
        open={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSettingsUpdated={onSettingsUpdated}
        onValidChange={(isValid) => setSettingsHasError(!isValid)}
      />
    </Box>
  );
}

export default React.memo(Sidebar);
