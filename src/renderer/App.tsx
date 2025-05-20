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
import SnackbarNotification from './components/common/SnackbarNotification';
import { sourceService } from './services/sourceService';

// テーマの設定
const theme = createTheme({
  palette: {
    primary: {
      main: '#ff7474',
      light: '#ff5252',
    },
    secondary: {
      main: '#f50057',
    },
    // background: {
    //   default: '#f5f5f5',
    // },
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
                  onReloadSources={handleReloadSources}
                  showSnackbar={showSnackbar}
                />

                {/* メインコンテンツ */}
                <ChatArea selectedRoomId={selectedRoomId} />

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
