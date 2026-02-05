import React from 'react';
import { Backdrop, Box, CircularProgress, Typography } from '@mui/material';
import type { ConversionProgress } from '@/types';

export interface FileConversionProgressOverlayProps {
  open: boolean;
  progress: ConversionProgress | null;
  title?: string;
}

/**
 * ファイル変換進捗表示用のオーバーレイコンポーネント
 * PDF変換・画像変換の進捗状況を表示する
 */
const FileConversionProgressOverlay: React.FC<
  FileConversionProgressOverlayProps
> = ({ open, progress, title = 'ファイルを変換しています' }) => {
  return (
    <Backdrop
      open={open}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.modal + 1,
        color: '#fff',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
      }}
    >
      <Box
        sx={{
          textAlign: 'center',
          p: 4,
          bgcolor: 'background.paper',
          borderRadius: 2,
          minWidth: 300,
          maxWidth: 500,
        }}
      >
        <CircularProgress size={60} sx={{ mb: 3 }} />
        <Typography variant="h6" gutterBottom color="text.primary">
          {title}
        </Typography>
        {progress && (
          <>
            <Typography variant="body1" color="text.primary" sx={{ mb: 1 }}>
              {progress.currentFileName}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {progress.conversionType === 'pdf' ? (
                <>
                  {progress.progressDetail?.type === 'sheet-setup' &&
                  progress.progressDetail.sheetName ? (
                    <>
                      「{progress.progressDetail.sheetName}」
                      シートPDF印刷設定中
                      {progress.progressDetail.currentSheet &&
                      progress.progressDetail.totalSheets ? (
                        <>
                          {' '}
                          ({progress.progressDetail.currentSheet}/
                          {progress.progressDetail.totalSheets})
                        </>
                      ) : null}
                    </>
                  ) : progress.progressDetail?.type === 'pdf-export' ? (
                    <>PDFファイルへエクスポート中</>
                  ) : (
                    <>PDFに変換中...</>
                  )}
                  <br />
                  ※<br />
                  変換に時間がかかる場合があります
                  <br />
                  変換されたPDFファイルはファイルパス、最終更新時刻をキーにキャッシュされます
                </>
              ) : (
                '画像に変換中...'
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              処理済み: {progress.currentIndex} / {progress.totalCount} ファイル
            </Typography>
          </>
        )}
      </Box>
    </Backdrop>
  );
};

export default React.memo(FileConversionProgressOverlay);
