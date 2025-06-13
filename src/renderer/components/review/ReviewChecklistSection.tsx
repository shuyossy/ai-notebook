import React, { useState, useMemo } from 'react';
import {
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
  Chip,
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
};

const ReviewChecklistSection: React.FC<ReviewChecklistSectionProps> = ({
  checklistResults,
  isLoading,
  onSave,
}) => {
  // --- 編集・追加用のステート ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newContent, setNewContent] = useState('');

  // --- ソート用のステート ---
  // sortBy: 現在ソート対象の sourceId。null のときソートなし。
  const [sortBy, setSortBy] = useState<number | null>(null);
  // sortDirection: 'desc' = 降順（A→B→C）、'asc' = 昇順（C→B→A）
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // --- 編集・保存・削除ハンドラ ---
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

  // --- ソート切り替えハンドラ ---
  const handleSort = (sourceId: number) => {
    if (sortBy === sourceId) {
      // 同じ列をクリックしたら昇順／降順をトグル
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      // 別の列をクリックしたら、その列を降順でソート開始
      setSortBy(sourceId);
      setSortDirection('desc');
    }
  };

  // --- 各チェックリストからユニークなソース一覧を抽出 ---
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

  // --- チェックリストをソート（ソースごとの評価値で並び替え） ---
  const sortedResults = useMemo(() => {
    // ソート対象がなければそのまま返す
    if (sortBy == null) {
      return checklistResults;
    }
    // コピーして破壊的変更を避ける
    return [...checklistResults].sort((a, b) => {
      const aEv =
        a.sourceEvaluations?.find((ev) => ev.sourceId === sortBy)?.evaluation ??
        null;
      const bEv =
        b.sourceEvaluations?.find((ev) => ev.sourceId === sortBy)?.evaluation ??
        null;

      // null（評価なし）は末尾に配置
      if (aEv === null && bEv !== null) return 1;
      if (aEv !== null && bEv === null) return -1;
      if (aEv === null && bEv === null) return 0;

      // 両方評価ありの場合、アルファベット順で比較
      // 'A'<'B'<'C' の順 → アルファベット昇順 = 降順（A→B→C）
      if (sortDirection === 'desc') {
        return (aEv as string).localeCompare(bEv as string);
      } else {
        // 昇順（C→B→A）
        return (bEv as string).localeCompare(aEv as string);
      }
    });
  }, [checklistResults, sortBy, sortDirection]);

  // --- テーブルヘッダをレンダリング ---
  const renderTableHeader = () => (
    <TableHead>
      <TableRow>
        <TableCell sx={{ width: '40%' }}>チェックリスト</TableCell>
        {uniqueSources.map((src) => (
          <TableCell key={src.id} align="center">
            {/* クリックでソート切り替え */}
            <TableSortLabel
              active={sortBy === src.id}
              direction={sortBy === src.id ? sortDirection : 'desc'}
              onClick={() => handleSort(src.id)}
            >
              {src.fileName}
            </TableSortLabel>
          </TableCell>
        ))}
        <TableCell align="center" sx={{ width: '120px' }}>
          操作
        </TableCell>
      </TableRow>
    </TableHead>
  );

  // --- 各行をレンダリング ---
  const renderTableRow = (checklist: (typeof checklistResults)[0]) => (
    <TableRow key={checklist.id}>
      <TableCell>
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
      </TableCell>
      {uniqueSources.map((src) => {
        const ev = checklist.sourceEvaluations?.find(
          (x) => x.sourceId === src.id,
        );
        return (
          <TableCell key={src.id} align="center">
            {ev?.evaluation ? (
              <Stack spacing={1} alignItems="center">
                <Chip
                  label={ev.evaluation}
                  sx={{
                    bgcolor: evaluationColors[ev.evaluation],
                    color: 'white',
                    fontWeight: 'bold',
                  }}
                />
                {ev.comment && (
                  <Typography variant="body2" color="text.secondary">
                    {ev.comment}
                  </Typography>
                )}
              </Stack>
            ) : null}
          </TableCell>
        );
      })}
      <TableCell align="center">
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

  // --- 新規追加行 ---
  const renderAddRow = () => (
    <TableRow>
      <TableCell>
        <TextField
          fullWidth
          multiline
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          variant="outlined"
          size="small"
          placeholder="新しいチェックリスト項目を入力"
        />
      </TableCell>
      {/* 列数揃えるために空セルを出力 */}
      {uniqueSources.map((_, i) => (
        <TableCell key={i} />
      ))}
      <TableCell align="center">
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
    <>
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

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          {renderTableHeader()}
          <TableBody>
            {/* ソート済みデータで行をレンダリング */}
            {sortedResults.map((cl) => renderTableRow(cl))}
            {isAddingNew && renderAddRow()}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default ReviewChecklistSection;
