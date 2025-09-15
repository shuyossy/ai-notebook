import React, { useState, useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  IconButton,
  Button,
  TextField,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { ReviewEvaluation } from '@/types';
import { ReviewChecklistSectionProps } from './types';
import {
  convertReviewResultsToCSV,
  downloadCSV,
  generateCSVFilename,
} from '../../lib/csvUtils';

// 評価ごとの色マッピング（デフォルト）
const defaultEvaluationColors = {
  A: '#4caf50', // 緑
  B: '#ffb74d', // オレンジ
  C: '#f44336', // 赤
  '-': '#9e9e9e', // グレー（評価対象外／評価不可能）
};

// 動的評価項目用の色取得関数
const getEvaluationColor = (evaluation: ReviewEvaluation): string => {
  // デフォルト色マッピングに存在する場合はそれを使用
  if (evaluation in defaultEvaluationColors) {
    // @ts-ignore
    return defaultEvaluationColors[evaluation];
  }
  // 存在しない場合はハッシュ値から色を生成
  let hash = 0;
  for (let i = 0; i < evaluation.length; i++) {
    hash = evaluation.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const ReviewChecklistSection: React.FC<ReviewChecklistSectionProps> = ({
  checklistResults,
  isLoading,
  onSave,
}) => {
  // --- ステート ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // --- ハンドラ ---
  const handleStartEdit = (id: number, content: string) => {
    setEditingId(id);
    setEditingContent(content);
  };
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };
  const handleSave = async () => {
    if (editingId == null) return;
    await onSave([{ content: editingContent, id: editingId }]);
    setEditingId(null);
    setEditingContent('');
  };
  const handleDelete = async (id: number) => {
    await onSave([{ id, delete: true }]);
  };
  const handleCancelAdd = () => {
    setIsAddingNew(false);
    setNewContent('');
  };
  const handleSaveNew = async () => {
    await onSave([{ content: newContent, id: null }]);
    setIsAddingNew(false);
    setNewContent('');
  };
  const handleSort = (fileId: string) => {
    if (sortBy === fileId) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(fileId);
      setSortDirection('desc');
    }
  };

  // CSV出力ハンドラ
  const handleExportCSV = () => {
    const csvContent = convertReviewResultsToCSV(checklistResults);
    const filename = generateCSVFilename();
    downloadCSV(csvContent, filename);
  };

  // --- ユニークファイル抽出 ---
  const uniqueSources = useMemo(() => {
    const map = new Map<string, { id: string; fileName: string }>();
    checklistResults.forEach((cl) => {
      cl.sourceEvaluations?.forEach((ev) => {
        if (!map.has(ev.fileId)) {
          map.set(ev.fileId, {
            id: ev.fileId,
            fileName: ev.fileName,
          });
        }
      });
    });
    return Array.from(map.values());
  }, [checklistResults]);

  // --- ソート ---
  // 動的評価項目対応のため、文字列順ソートを使用
  const sortedResults = useMemo(() => {
    if (sortBy == null) return checklistResults;

    return [...checklistResults].sort((a, b) => {
      // 対象ファイルの評価を取得。未評価は空文字扱い
      const aEv =
        a.sourceEvaluations?.find((ev) => ev.fileId === sortBy)?.evaluation ??
        '';
      const bEv =
        b.sourceEvaluations?.find((ev) => ev.fileId === sortBy)?.evaluation ??
        '';

      // 文字列順で比較
      if (sortDirection === 'desc') {
        return bEv.localeCompare(aEv);
      } else {
        return aEv.localeCompare(bEv);
      }
    });
  }, [checklistResults, sortBy, sortDirection]);

  // --- ボックス用スタイル ---
  const contentBoxSx = {
    maxHeight: '15em',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word' as const,
    textAlign: 'left',
  };
  const commentBoxSx = { ...contentBoxSx };

  // --- ヘッダ ---
  const renderHeader = () => (
    <TableHead>
      <TableRow>
        {/* チェックリスト列を固定幅 */}
        <TableCell
          sx={{ minWidth: 250, whiteSpace: 'normal', wordBreak: 'break-word' }}
        >
          チェックリスト
        </TableCell>
        {uniqueSources.map((src) => (
          <TableCell key={src.id} align="center" sx={{ minWidth: 200 }}>
            <TableSortLabel
              active={sortBy === src.id}
              direction={sortBy === src.id ? sortDirection : 'desc'}
              onClick={() => handleSort(src.id)}
            >
              {src.fileName}
            </TableSortLabel>
          </TableCell>
        ))}
        <TableCell align="center" sx={{ minWidth: 120 }}>
          操作
        </TableCell>
      </TableRow>
    </TableHead>
  );

  // --- 行 ---
  const renderRow = (checklist: (typeof checklistResults)[0]) => (
    <TableRow key={checklist.id}>
      {/* チェックリスト */}
      <TableCell sx={{ p: 1, verticalAlign: 'top' }}>
        <Box sx={contentBoxSx}>
          {editingId === checklist.id ? (
            <TextField
              fullWidth
              multiline
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              variant="outlined"
              size="small"
            />
          ) : (
            checklist.content
          )}
        </Box>
      </TableCell>
      {/* 評価列 */}
      {uniqueSources.map((src) => {
        const ev = checklist.sourceEvaluations?.find(
          (x) => x.fileId === src.id,
        );
        return (
          <TableCell
            key={src.id}
            align="center"
            sx={{ p: 1, verticalAlign: 'top' }}
          >
            <Box>
              {ev?.evaluation && (
                <Stack spacing={1} alignItems="center">
                  <Typography
                    variant="body2"
                    sx={{
                      color: getEvaluationColor(ev.evaluation),
                      fontWeight: 'bold',
                      textDecoration: 'underline',
                      textDecorationColor: getEvaluationColor(ev.evaluation),
                      textDecorationThickness: '2px',
                      textUnderlineOffset: '3px',
                    }}
                  >
                    {ev.evaluation}
                  </Typography>
                  {ev.comment && (
                    <Typography variant="body2" sx={commentBoxSx}>
                      {ev.comment}
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          </TableCell>
        );
      })}
      {/* 操作 */}
      <TableCell align="center" sx={{ p: 1 }}>
        <Stack direction="row" spacing={1} justifyContent="center">
          {editingId === checklist.id ? (
            <>
              <IconButton size="small" onClick={handleSave} color="primary">
                <SaveIcon />
              </IconButton>
              <IconButton size="small" onClick={handleCancelEdit} color="error">
                <CancelIcon />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton
                size="small"
                onClick={() => handleStartEdit(checklist.id, checklist.content)}
                disabled={isLoading}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => handleDelete(checklist.id)}
                color="error"
                disabled={isLoading}
              >
                <DeleteIcon />
              </IconButton>
            </>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );

  // --- 追加行 ---
  const renderAdd = () => (
    <TableRow>
      <TableCell sx={{ p: 1 }}>
        <Box sx={contentBoxSx}>
          <TextField
            fullWidth
            multiline
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            variant="outlined"
            size="small"
            placeholder="新しいチェックリスト項目を入力"
          />
        </Box>
      </TableCell>
      {uniqueSources.map((_, i) => (
        // eslint-disable-next-line
        <TableCell key={i} />
      ))}
      <TableCell align="center" sx={{ p: 1 }}>
        <Stack direction="row" spacing={1} justifyContent="center">
          <IconButton
            size="small"
            onClick={handleSaveNew}
            color="primary"
            disabled={!newContent.trim()}
          >
            <SaveIcon />
          </IconButton>
          <IconButton size="small" onClick={handleCancelAdd} color="error">
            <CancelIcon />
          </IconButton>
        </Stack>
      </TableCell>
    </TableRow>
  );

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Stack direction="row" justifyContent="flex-end" spacing={1} mb={2}>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={handleExportCSV}
          disabled={isLoading || checklistResults.length === 0}
        >
          CSV出力
        </Button>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setIsAddingNew(true)}
          disabled={isLoading || isAddingNew}
        >
          チェックリスト追加
        </Button>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ width: '100%', overflowX: 'auto' }}
        >
          <Table size="small" stickyHeader>
            {renderHeader()}
            <TableBody>
              {sortedResults.map((cl) => renderRow(cl))}
              {isAddingNew && renderAdd()}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default ReviewChecklistSection;
