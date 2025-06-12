import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newContent, setNewContent] = useState('');

  // 編集開始
  const handleStartEdit = (id: number, content: string) => {
    setEditingId(id);
    setEditingContent(content);
  };

  // 編集キャンセル
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  // 新規追加キャンセル
  const handleCancelAdd = () => {
    setIsAddingNew(false);
    setNewContent('');
  };

  // 保存処理
  const handleSave = async () => {
    await onSave([
      {
        content: editingContent,
        id: editingId, // 既存のIDを使用
      },
    ]);
    setEditingId(null);
    setEditingContent('');
  };

  // 新規追加保存
  const handleSaveNew = async () => {
    await onSave([
      {
        content: newContent,
        id: null, // 新規追加なのでIDはnull
      },
    ]);
    setIsAddingNew(false);
    setNewContent('');
  };

  // 削除処理
  const handleDelete = async (id: number) => {
    await onSave([
      {
        id, // 削除対象のIDを指定
        delete: true, // 削除フラグを立てる
      },
    ]);
  };

  // ソースファイルのカラムヘッダーを生成
  const sourceHeaders =
    checklistResults[0]?.sourceEvaluations?.map((evaluation) => (
      <TableCell key={evaluation.sourceId} align="center">
        {evaluation.sourceFileName}
      </TableCell>
    )) || [];

  // テーブルのヘッダー部分
  const renderTableHeader = () => (
    <TableHead>
      <TableRow>
        <TableCell sx={{ width: '40%' }}>チェックリスト</TableCell>
        {sourceHeaders}
        <TableCell align="center" sx={{ width: '120px' }}>
          操作
        </TableCell>
      </TableRow>
    </TableHead>
  );

  // テーブルの行を生成
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
      {checklist.sourceEvaluations?.map((evaluation) => (
        <TableCell key={evaluation.sourceId} align="center">
          {evaluation.evaluation && (
            <Stack spacing={1} alignItems="center">
              <Chip
                label={evaluation.evaluation}
                sx={{
                  bgcolor: evaluationColors[evaluation.evaluation],
                  color: 'white',
                  fontWeight: 'bold',
                }}
              />
              {evaluation.comment && (
                <Typography variant="body2" color="text.secondary">
                  {evaluation.comment}
                </Typography>
              )}
            </Stack>
          )}
        </TableCell>
      ))}
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

  // 新規追加行
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
      {sourceHeaders.map((_, i) => (
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
            {checklistResults.map((checklist) => renderTableRow(checklist))}
            {isAddingNew && renderAddRow()}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default ReviewChecklistSection;
