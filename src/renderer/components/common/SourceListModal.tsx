import React, { useEffect, useState } from 'react';
import {
  AlertColor,
  Modal,
  Box,
  Typography,
  Button,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Tooltip,
  Chip,
  Checkbox,
} from '@mui/material';
import {
  Check as CheckIcon,
  Error as ErrorIcon,
  Sync as SyncIcon,
  HourglassEmpty as ProcessingIcon,
  Help as UnknownIcon,
} from '@mui/icons-material';

import { Source } from '../../../db/schema';

interface SourceListModalProps {
  open: boolean;
  processing: boolean;
  onClose: () => void;
  onReloadSources: () => void;
  onStatusUpdate: (status: {
    processing: boolean;
    enabledCount: number;
  }) => void;
  showSnackbar: (message: string, severity: AlertColor) => void;
}

function SourceListModal({
  open,
  processing,
  onClose,
  onReloadSources,
  onStatusUpdate,
  showSnackbar,
}: SourceListModalProps): React.ReactElement {
  const [sources, setSources] = useState<Source[]>([]);
  const [checkedSources, setCheckedSources] = useState<{
    [key: number]: boolean;
  }>({});
  const [updatingSources, setUpdatingSources] = useState<Set<number>>(
    new Set(),
  );

  // チェック状態の更新
  useEffect(() => {
    const initialCheckedState = sources.reduce(
      (acc, source) => {
        acc[source.id] = source.isEnabled === 1;
        return acc;
      },
      {} as { [key: number]: boolean },
    );
    setCheckedSources(initialCheckedState);
  }, [sources]);

  // チェックボックスの変更ハンドラ
  const handleSourceCheckChange = async (sourceId: number) => {
    // 更新中の場合は処理をスキップ
    if (processing || updatingSources.size > 0) return;

    const newCheckedState = { ...checkedSources };
    newCheckedState[sourceId] = !checkedSources[sourceId];
    setCheckedSources(newCheckedState);

    // 更新中状態に追加
    setUpdatingSources((prev) => new Set(prev).add(sourceId));

    try {
      const { success, error } =
        await window.electron.source.updateSourceEnabled(
          sourceId,
          newCheckedState[sourceId],
        );
      if (!success) {
        showSnackbar(
          `${sources.find((s) => s.id === sourceId)?.path}の有効化/無効化に失敗しました: ${error}`,
          'error',
        );
        // チェック状態を元に戻す
        setCheckedSources((prev) => ({
          ...prev,
          [sourceId]: !newCheckedState[sourceId],
        }));
      }
    } catch (err) {
      console.error('ソース状態の更新に失敗しました:', err);
    } finally {
      // 更新中状態から削除
      setUpdatingSources((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
    }
  };

  // 全選択/全解除の切り替えハンドラ
  const handleSelectAllChange = () => {
    // 更新中の場合は処理をスキップ
    if (processing || updatingSources.size > 0) return;

    const someUnchecked = Object.values(checkedSources).some(
      (checked) => !checked,
    );
    const newCheckedState = { ...checkedSources };

    // 一つでもチェックが外れているものがあれば全選択、すべてチェック済みなら全解除
    const newValue = someUnchecked;

    // すべてのソースのチェック状態を更新
    sources.forEach((source) => {
      newCheckedState[source.id] = newValue;
    });
    setCheckedSources(newCheckedState);

    // 全てのソースを更新中状態に追加
    setUpdatingSources(new Set(sources.map((source) => source.id)));

    // 各ソースの状態を更新
    sources.forEach(async (source) => {
      try {
        const { success, error } =
          await window.electron.source.updateSourceEnabled(source.id, newValue);
        if (!success) {
          showSnackbar(
            `${source.path}の有効化/無効化に失敗しました: ${error}`,
            'error',
          );
          // チェック状態を元に戻す
          setCheckedSources((prev) => ({
            ...prev,
            [source.id]: !newValue,
          }));
        }

        // 完了したソースを更新中状態から削除
        setUpdatingSources((prev) => {
          const next = new Set(prev);
          next.delete(source.id);
          return next;
        });
      } catch (err) {
        console.error('ソース状態の更新に失敗しました:', err);
        // エラー時もソースを更新中状態から削除
        setUpdatingSources((prev) => {
          const next = new Set(prev);
          next.delete(source.id);
          return next;
        });
      }
    });
  };

  // ソースデータの定期更新（processingステータスがある場合のみ）
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const response = await window.electron.source.getSources();
        const responseSources: Source[] = response.sources || [];
        setSources(responseSources);
        const newProcessing = responseSources.some(
          (s: Source) => s.status === 'idle' || s.status === 'processing',
        );
        // 状態更新
        const enabledCount = responseSources.filter(
          (s: Source) => s.isEnabled === 1 && s.status === 'completed',
        ).length;
        onStatusUpdate({ processing: newProcessing, enabledCount });
      } catch (error) {
        console.error('ソースデータの取得に失敗しました:', error);
      }
    };

    const intervalId = setInterval(fetchSources, 5000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [open, checkedSources, onStatusUpdate]);

  const handleReloadClick = () => {
    onReloadSources();
  };

  const getStatusIcon = (status: Source['status'], error?: Source['error']) => {
    switch (status) {
      case 'completed':
        return (
          <Chip
            icon={<CheckIcon />}
            label="完了"
            color="success"
            size="small"
            variant="outlined"
          />
        );
      case 'failed':
        return (
          <Tooltip title={error ?? '不明なエラー'}>
            <Chip
              icon={<ErrorIcon />}
              label="エラー"
              color="error"
              size="small"
              variant="outlined"
            />
          </Tooltip>
        );
      case 'processing':
        return (
          <Chip
            icon={<ProcessingIcon />}
            label="処理中"
            color="primary"
            size="small"
            variant="outlined"
          />
        );
      case 'idle':
        return (
          <Chip
            icon={<SyncIcon />}
            label="待機中"
            color="default"
            size="small"
            variant="outlined"
          />
        );
      default:
        return (
          <Chip
            icon={<UnknownIcon />}
            label="不明"
            color="default"
            size="small"
            variant="outlined"
          />
        );
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          maxWidth: 800,
          bgcolor: 'background.paper',
          boxShadow: 24,
          p: 4,
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 1,
        }}
      >
        <Typography variant="h6" component="h2" gutterBottom>
          ソース一覧
        </Typography>

        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title="ソース登録ディレクトリ内のファイル内容と同期します">
            <Button
              variant="contained"
              onClick={handleReloadClick}
              disabled={processing || updatingSources.size > 0}
              startIcon={<SyncIcon />}
            >
              {processing ? '処理中...' : 'ソース読み込み'}
            </Button>
          </Tooltip>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Tooltip
                    title={
                      <span style={{ whiteSpace: 'pre-line' }}>
                        {
                          'AIが回答時に利用するソースを選択してください\nチェックした内容は即時に反映されます'
                        }
                      </span>
                    }
                  >
                    <Checkbox
                      indeterminate={
                        Object.values(checkedSources).some(
                          (checked) => checked,
                        ) &&
                        Object.values(checkedSources).some(
                          (checked) => !checked,
                        )
                      }
                      checked={
                        Object.values(checkedSources).length > 0 &&
                        Object.values(checkedSources).every(
                          (checked) => checked,
                        )
                      }
                      onChange={handleSelectAllChange}
                      disabled={processing || updatingSources.size > 0}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>ファイルパス</TableCell>
                <TableCell>タイトル（生成）</TableCell>
                <TableCell>ステータス</TableCell>
                <TableCell>最終更新</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((source) => (
                <TableRow
                  key={source.id}
                  sx={{
                    '&:last-child td, &:last-child th': { border: 0 },
                    backgroundColor:
                      source.status === 'failed' ? 'error.lighter' : 'inherit',
                  }}
                >
                  <TableCell padding="checkbox">
                    <Tooltip
                      title={
                        <span style={{ whiteSpace: 'pre-line' }}>
                          {
                            'AIが回答時に利用するソースを選択してください\nチェックした内容は即時に反映されます'
                          }
                        </span>
                      }
                    >
                      <Checkbox
                        checked={checkedSources[source.id] || false}
                        onChange={() => handleSourceCheckChange(source.id)}
                        disabled={processing || updatingSources.size > 0}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>{source.path}</TableCell>
                  <TableCell>{source.title}</TableCell>
                  <TableCell>
                    {getStatusIcon(source.status, source.error)}
                  </TableCell>
                  <TableCell>
                    {new Date(source.updatedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Modal>
  );
}

export default React.memo(SourceListModal);
