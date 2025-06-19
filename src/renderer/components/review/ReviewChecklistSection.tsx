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
  Avatar,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { ReviewChecklistSectionProps } from './types';
import { ReviewEvaluation } from '../../../main/types';

// 評価ごとの色マッピング
const evaluationColors: Record<ReviewEvaluation, string> = {
  A: '#4caf50', // 緑
  B: '#ffb74d', // オレンジ
  C: '#f44336', // 赤
  '-': '#9e9e9e', // グレー（評価対象外／評価不可能）
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
  const [sortBy, setSortBy] = useState<number | null>(null);
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
  const handleSort = (sourceId: number) => {
    if (sortBy === sourceId) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(sourceId);
      setSortDirection('desc');
    }
  };

  // --- ユニークソース抽出 ---
  const uniqueSources = useMemo(() => {
    const map = new Map<number, { id: number; fileName: string }>();
    checklistResults.forEach((cl) => {
      cl.sourceEvaluations?.forEach((ev) => {
        if (!map.has(ev.sourceId)) {
          map.set(ev.sourceId, {
            id: ev.sourceId,
            fileName: ev.sourceFileName,
          });
        }
      });
    });
    return Array.from(map.values());
  }, [checklistResults]);

  // --- ソート ---
  const descOrder: ReviewEvaluation[] = ['A', 'B', 'C', '-'];
  const ascOrder: ReviewEvaluation[] = ['C', 'A', 'B', '-'];

  const sortedResults = useMemo(() => {
    if (sortBy == null) return checklistResults;

    // ソート方向に応じて使う配列を選択
    const order = sortDirection === 'desc' ? descOrder : ascOrder;

    return [...checklistResults].sort((a, b) => {
      // 対象ソースの評価を取得。未評価は '-' 扱い
      const aEv =
        a.sourceEvaluations?.find((ev) => ev.sourceId === sortBy)?.evaluation ??
        '-';
      const bEv =
        b.sourceEvaluations?.find((ev) => ev.sourceId === sortBy)?.evaluation ??
        '-';

      // 配列のインデックスで比較
      const aIdx = order.indexOf(aEv);
      const bIdx = order.indexOf(bEv);

      return aIdx - bIdx;
    });
    // eslint-disable-next-line
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
          (x) => x.sourceId === src.id,
        );
        return (
          <TableCell
            key={src.id}
            align="center"
            sx={{ p: 1, verticalAlign: 'top' }}
          >
            <Box sx={commentBoxSx}>
              {ev?.evaluation && (
                <Stack spacing={1} alignItems="center">
                  <Avatar
                    sx={{
                      bgcolor: evaluationColors[ev.evaluation],
                      width: 32,
                      height: 32,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'white', fontWeight: 'bold' }}
                    >
                      {ev.evaluation}
                    </Typography>
                  </Avatar>
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
      <Stack direction="row" justifyContent="flex-end" mb={2}>
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
