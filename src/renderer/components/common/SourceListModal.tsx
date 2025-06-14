import React, { useEffect, useState } from 'react';
import {
  Modal,
  Box,
  Typography,
  IconButton,
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
  onClose: () => void;
  onReloadSources: () => void;
}

function SourceListModal({
  open,
  onClose,
  onReloadSources,
}: SourceListModalProps): React.ReactElement {
  const [sources, setSources] = useState<Source[]>([]);
  const [processing, setProcessing] = useState(false);
  const [checkedSources, setCheckedSources] = useState<{
    [key: number]: boolean;
  }>({});

  // チェック状態の初期化
  useEffect(() => {
    // すべてのソースのチェック状態をtrueで初期化
    const initialCheckedState = sources.reduce(
      (acc, source) => {
        acc[source.id] = true;
        return acc;
      },
      {} as { [key: number]: boolean },
    );
    setCheckedSources(initialCheckedState);
  }, [sources]);

  // チェックボックスの変更ハンドラ
  const handleSourceCheckChange = async (sourceId: number) => {
    const newCheckedState = { ...checkedSources };
    newCheckedState[sourceId] = !checkedSources[sourceId];
    setCheckedSources(newCheckedState);

    try {
      await window.electron.source.updateSourceEnabled(
        sourceId,
        newCheckedState[sourceId],
      );
    } catch (error) {
      console.error('ソース状態の更新に失敗しました:', error);
    }
  };

  // 全選択/全解除の切り替えハンドラ
  const handleSelectAllChange = () => {
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

    // 各ソースの状態を更新
    sources.forEach(async (source) => {
      try {
        await window.electron.source.updateSourceEnabled(source.id, newValue);
      } catch (error) {
        console.error('ソース状態の更新に失敗しました:', error);
      }
    });
  };

  // ソースデータの定期更新（processingステータスがある場合のみ）
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const fetchSources = async () => {
      try {
        const response = await window.electron.source.getSources();
        const responseSources: Source[] = response.sources || [];
        setSources(responseSources);
        setProcessing(
          responseSources.some(
            (s: Source) => s.status === 'idle' || s.status === 'processing',
          ),
        );
      } catch (error) {
        console.error('ソースデータの取得に失敗しました:', error);
      }
    };

    if (open) {
      // 初回データ取得
      fetchSources();

      // processingステータスがある場合は5秒ごとに更新
      if (processing) {
        intervalId = setInterval(fetchSources, 3000);
      }
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [open, processing]);

  const handleReloadClick = () => {
    onReloadSources();
  };

  const getStatusIcon = (status: Source['status']) => {
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
          <Chip
            icon={<ErrorIcon />}
            label="エラー"
            color="error"
            size="small"
            variant="outlined"
          />
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
              onClick={() => {
                setProcessing(true);
                handleReloadClick();
              }}
              disabled={processing}
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
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>{source.path}</TableCell>
                  <TableCell>{source.title}</TableCell>
                  <TableCell>
                    {getStatusIcon(source.status)}
                    {source.error && (
                      <Tooltip title={source.error}>
                        <IconButton size="small" color="error">
                          <ErrorIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
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
