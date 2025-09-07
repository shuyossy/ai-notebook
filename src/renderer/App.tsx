import React, { useState } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Alert,
  Stack, // ← 追加：縦並び用
} from '@mui/material';
import './App.css';
import Sidebar from './components/sidebar/Sidebar';
import ChatArea from './components/chat/ChatArea';
import ReviewArea from './components/review/ReviewArea';
import { SourceApi } from './service/sourceApi';
import { useAlertStore } from './stores/alertStore';
import { ROUTES } from '../types';
import ChatRoomList from './components/chat/ChatRoomList';
import ReviewHistoryList from './components/review/ReviewHistoryList';

// テーマの設定
const theme = createTheme({
  palette: {
    primary: {
      main: '#BA0009',
      light: '#ff5252',
    },
    secondary: {
      main: '#BA5F00',
    },
    // background: {
    //   default: '#f5f5f5',
    // },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
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
  const [selectedReviewHistoryId, setSelectedReviewHistoryId] = useState<
    string | null
  >(null);
  const alerts = useAlertStore((state) => state.alerts);
  const addAlert = useAlertStore((state) => state.addAlert);
  const removeAlert = useAlertStore((state) => state.removeAlert);

  // ソース再読み込みハンドラ
  const handleReloadSources = async () => {
    const sourceApi = SourceApi.getInstance();
    try {
      await sourceApi.reloadSources({
        showAlert: false,
        throwError: true,
        printErrorLog: true,
      });
      addAlert({
        message: 'ソースの再読み込みが完了しました',
        severity: 'success',
      });
    } catch (error) {
      addAlert({
        message: `${(error as Error).message}`,
        severity: 'error',
      });
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box
          sx={{
            display: 'flex',
            height: '100vh',
          }}
        >
          {/* サイドバー */}
          <Sidebar onReloadSources={handleReloadSources}>
            <Routes>
              <Route
                path={ROUTES.CHAT}
                element={
                  <ChatRoomList
                    onRoomSelect={setSelectedRoomId}
                    selectedRoomId={selectedRoomId}
                  />
                }
              />
              <Route
                path={ROUTES.REVIEW}
                element={
                  <ReviewHistoryList
                    onReviewHistorySelect={setSelectedReviewHistoryId}
                    selectedReviewHistoryId={selectedReviewHistoryId}
                  />
                }
              />
            </Routes>
          </Sidebar>

          {/* メインコンテンツ領域：ここを relative にして、内部で absolute 配置する */}
          <Box
            component="main"
            sx={{
              position: 'relative', // ★ アラートを「この領域の中」で絶対配置できるようにする
              flex: 1, // サイドバー以外の空間をすべて使う
              minWidth: 0, // コンテンツのオーバーフロー対策
              overflow: 'hidden', // スクロールバー制御（必要なら調整）
              display: 'flex', // 中身のレイアウト（任意）
            }}
          >
            {/* ルーティング（通常表示の中身） */}
            <Routes>
              <Route
                path={ROUTES.CHAT}
                element={<ChatArea selectedRoomId={selectedRoomId} />}
              />
              <Route
                path={ROUTES.REVIEW}
                element={
                  <ReviewArea
                    selectedReviewHistoryId={selectedReviewHistoryId}
                  />
                }
              />
            </Routes>

            {/* 中央オーバーレイのエラーメッセージ表示 */}
            {alerts.length > 0 && (
              <Box
                // ★ main(Box)の「中」で中央に重ねる
                sx={{
                  position: 'absolute',
                  top: 20,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 'fit-content',
                  maxWidth: '80%',
                  zIndex: 1300,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Stack spacing={1} sx={{ pointerEvents: 'auto' }}>
                  {alerts.map((error) => (
                    <Alert
                      key={error.id}
                      severity={error.severity}
                      onClose={() => removeAlert(error.id)}
                      sx={{
                        whiteSpace: 'pre-line', // 改行を表現
                        boxShadow: 3, // ちょい浮かせる
                      }}
                    >
                      {error.message}
                    </Alert>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;
