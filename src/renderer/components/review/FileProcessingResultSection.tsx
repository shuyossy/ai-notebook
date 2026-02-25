import React, { useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { DocumentCacheInfo } from '@/types';
import {
  isRichFormatType,
  isPlainOnlyFormatType,
  hasRichStrategyAvailable,
} from '../../lib/textExtractionFormatHelper';

interface FileProcessingResultSectionProps {
  documentCaches: DocumentCacheInfo[];
}

/**
 * 画像・図形抽出列のバッジを判定
 */
function getExtractionBadge(cache: DocumentCacheInfo): {
  label: string;
  variant: 'success' | 'error' | 'default';
} {
  // 画像変換モードは対象外
  if (cache.processMode === 'image') {
    return { label: '-', variant: 'default' };
  }
  // txt, csv はプレーンオンリー（画像・図形抽出の概念がない）
  if (isPlainOnlyFormatType(cache.formatType)) {
    return { label: '-', variant: 'default' };
  }
  // リッチ戦略がないファイル形式は対象外
  if (!hasRichStrategyAvailable(cache.fileName)) {
    return { label: '-', variant: 'default' };
  }
  // リッチフォーマットで抽出成功
  if (isRichFormatType(cache.formatType)) {
    return { label: '成功', variant: 'success' };
  }
  // プレーンフォーマットへフォールバック（リッチ戦略失敗）
  return { label: '失敗', variant: 'error' };
}

/**
 * ファイル内画像列の表示を判定
 */
function getIncludeImagesLabel(cache: DocumentCacheInfo): string {
  if (cache.processMode === 'image') {
    return '-';
  }
  if (isPlainOnlyFormatType(cache.formatType)) {
    return '-';
  }
  // リッチ戦略対象ファイルだがフォールバックした場合、画像は実際には抽出されていない
  if (
    hasRichStrategyAvailable(cache.fileName) &&
    !isRichFormatType(cache.formatType)
  ) {
    return '-';
  }
  return cache.includeImages ? 'あり' : 'なし';
}

/**
 * 処理モードの表示ラベル
 */
function getProcessModeLabel(processMode: string): string {
  return processMode === 'image' ? '画像変換' : 'テキスト抽出';
}

/**
 * ファイル処理結果セクション
 * レビュー結果画面でファイルごとのテキスト抽出処理結果を表示する
 */
const FileProcessingResultSection: React.FC<
  FileProcessingResultSectionProps
> = ({ documentCaches }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Box sx={{ mb: 2 }}>
      {/* 折りたたみトリガー */}
      <Stack
        direction="row"
        alignItems="center"
        onClick={() => setIsOpen(!isOpen)}
        sx={{
          cursor: 'pointer',
          px: 2,
          py: 1,
          bgcolor: 'grey.50',
          border: 1,
          borderColor: 'grey.200',
          borderRadius: 1,
          '&:hover': { bgcolor: 'grey.100' },
          transition: 'background-color 0.2s',
        }}
      >
        <IconButton size="small" sx={{ mr: 1 }}>
          {isOpen ? (
            <ExpandLessIcon fontSize="small" />
          ) : (
            <ExpandMoreIcon fontSize="small" />
          )}
        </IconButton>
        <Typography variant="body2" fontWeight="medium" color="text.secondary">
          ファイル処理結果
        </Typography>
      </Stack>

      {/* 折りたたみコンテンツ */}
      <Collapse in={isOpen}>
        <Box
          sx={{
            mt: 1,
            border: 1,
            borderColor: 'grey.200',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      bgcolor: 'grey.50',
                    }}
                  >
                    ファイル名
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      bgcolor: 'grey.50',
                    }}
                  >
                    処理モード
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      bgcolor: 'grey.50',
                    }}
                  >
                    ファイル内画像
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      bgcolor: 'grey.50',
                    }}
                  >
                    画像・図形抽出
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documentCaches.map((cache, index) => {
                  const extractionBadge = getExtractionBadge(cache);
                  const includeImagesLabel = getIncludeImagesLabel(cache);

                  return (
                    <TableRow key={cache.fileName}>
                      <TableCell sx={{ fontSize: '0.875rem' }}>
                        {cache.fileName}
                      </TableCell>
                      <TableCell
                        sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
                      >
                        {getProcessModeLabel(cache.processMode)}
                      </TableCell>
                      <TableCell
                        sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
                      >
                        {includeImagesLabel === '-' ? (
                          <Typography
                            component="span"
                            sx={{ color: 'grey.400' }}
                          >
                            -
                          </Typography>
                        ) : (
                          includeImagesLabel
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.875rem' }}>
                        {extractionBadge.label === '-' ? (
                          <Typography
                            component="span"
                            sx={{ color: 'grey.400' }}
                          >
                            -
                          </Typography>
                        ) : (
                          <Chip
                            label={extractionBadge.label}
                            color={extractionBadge.variant}
                            size="small"
                            sx={{ fontWeight: 'medium' }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* 説明ボックス */}
          <Alert
            severity="info"
            icon={<InfoOutlinedIcon fontSize="small" />}
            sx={{
              borderTop: 1,
              borderColor: 'grey.200',
              borderRadius: 0,
              '& .MuiAlert-message': { fontSize: '0.75rem' },
            }}
          >
            <Typography variant="caption" fontWeight="bold" display="block">
              画像・図形処理についてはファイル形式ごとに処理方法が異なります
            </Typography>
            <Box component="ul" sx={{ pl: 2, my: 0.5 }}>
              <li>
                <Typography variant="caption">
                  Word・PDF：挿入された画像・図形情報（図形内テキスト）
                </Typography>
              </li>
              <li>
                <Typography variant="caption">
                  Excel・PowerPoint：挿入された画像・図形情報（図形内テキスト・種類・大きさ・座標）
                </Typography>
              </li>
            </Box>
            <Typography variant="caption" color="info.dark">
              ※挿入画像を含めないよう選択している場合は図形情報のみ利用し、画像は含めません
            </Typography>
          </Alert>
        </Box>
      </Collapse>
    </Box>
  );
};

export default FileProcessingResultSection;
