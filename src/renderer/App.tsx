import React, { useState } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AlertColor,
} from '@mui/material';
import './App.css';
import Sidebar from './components/sidebar/Sidebar';
import ChatArea from './components/chat/ChatArea';
import SettingsModal from './components/common/SettingsModal';
import SnackbarNotification from './components/common/SnackbarNotification';
import CreateChatRoomModal from './components/chat/CreateChatRoomModal';
import { ChatRoom } from './types';
import { sourceService } from './services/sourceService';

// テーマの設定
const theme = createTheme({
  palette: {
    primary: {
      main: '#3f51b5',
      light: '#e8eaf6',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
        },
      },
    },
  },
});

function App() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: AlertColor;
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // チャットルーム選択ハンドラ
  const handleRoomSelect = (roomId: string) => {
    setSelectedRoomId(roomId);
  };

  // チャットルーム作成ハンドラ
  const handleCreateRoom = () => {
    setIsCreateRoomModalOpen(true);
  };

  // 設定ボタンクリックハンドラ
  const handleSettingsClick = () => {
    setIsSettingsModalOpen(true);
  };

  // スナックバー表示ヘルパー
  const showSnackbar = (message: string, severity: AlertColor) => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  // ソース再読み込みハンドラ
  const handleReloadSources = async () => {
    try {
      const result = await sourceService.reloadSources();
      if (result.success) {
        showSnackbar(
          result.message || 'ソースの再読み込みが完了しました',
          'success',
        );
      } else {
        showSnackbar(
          result.message || 'ソースの再読み込みに失敗しました',
          'error',
        );
      }
    } catch (error) {
      showSnackbar(
        `ソースの再読み込みに失敗しました: ${(error as Error).message}`,
        'error',
      );
    }
  };

  // チャットルーム作成完了ハンドラ
  const handleRoomCreated = (room: ChatRoom) => {
    setSelectedRoomId(room.id);
    showSnackbar('チャットルームを作成しました', 'success');
  };

  // 設定更新完了ハンドラ
  const handleSettingsUpdated = () => {
    showSnackbar('設定を更新しました', 'success');
  };

  // スナックバーを閉じる
  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              <Box
                sx={{
                  display: 'flex',
                  height: '100vh',
                }}
              >
                {/* サイドバー */}
                <Sidebar
                  selectedRoomId={selectedRoomId}
                  onRoomSelect={handleRoomSelect}
                  onCreateRoom={handleCreateRoom}
                  onSettingsClick={handleSettingsClick}
                  onReloadSources={handleReloadSources}
                />

                {/* メインコンテンツ */}
                <ChatArea selectedRoomId={selectedRoomId} />

                {/* モーダル */}
                <SettingsModal
                  open={isSettingsModalOpen}
                  onClose={() => setIsSettingsModalOpen(false)}
                  onSettingsUpdated={handleSettingsUpdated}
                />

                <CreateChatRoomModal
                  open={isCreateRoomModalOpen}
                  onClose={() => setIsCreateRoomModalOpen(false)}
                  onRoomCreated={handleRoomCreated}
                />

                {/* 通知 */}
                <SnackbarNotification
                  open={snackbar.open}
                  message={snackbar.message}
                  severity={snackbar.severity}
                  onClose={handleCloseSnackbar}
                />
              </Box>
            }
          />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
