import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
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
import { useAlertStore } from '@/renderer/stores/alertStore';
import { getSafeErrorMessage } from '../../lib/error';

import { Source } from '../../../db/schema';
import { SourceApi } from '../../service/sourceApi';

interface SourceListModalProps {
  open: boolean;
  processing: boolean;
  onClose: () => void;
  onReloadSources: () => void;
  onStatusUpdate: (status: {
    processing: boolean;
    enabledCount: number;
  }) => void;
}

function SourceListModal({
  open,
  processing,
  onClose,
  onReloadSources,
  onStatusUpdate,
}: SourceListModalProps): React.ReactElement {
  const [sources, setSources] = useState<Source[]>([]);
  const [checkedSources, setCheckedSources] = useState<{
    [key: number]: boolean;
  }>({});
  const [updatingSources, setUpdatingSources] = useState<Set<number>>(
    new Set(),
  );
  const [reloadPolling, setReloadPolling] = useState(false);

  const addAlert = useAlertStore((state) => state.addAlert);

  // チェック状態の更新
  useEffect(() => {
    const initialCheckedState = sources.reduce(
      (acc, source) => {
        // statusがcompletedでない場合はチェックを外す
        if (source.status !== 'completed') {
          acc[source.id] = false;
          return acc;
        }
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
      const sourceApi = SourceApi.getInstance();
      await sourceApi.updateSourceEnabled(sourceId, newCheckedState[sourceId], {
        showAlert: true,
        throwError: true,
      });
    } catch (err) {
      // チェック状態を元に戻す
      setCheckedSources((prev) => ({
        ...prev,
        [sourceId]: !newCheckedState[sourceId],
      }));
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

    const targetSources = sources.filter(
      (source) => source.status === 'completed',
    );
    if (targetSources.length === 0) {
      return;
    }
    const targetCheckedSources = targetSources.reduce(
      (acc, source) => {
        acc[source.id] = checkedSources[source.id] || false;
        return acc;
      },
      {} as { [key: number]: boolean },
    );

    const someUnchecked = Object.values(targetCheckedSources).some(
      (checked) => !checked,
    );
    const newCheckedState = { ...checkedSources };

    // 一つでもチェックが外れているものがあれば全選択、すべてチェック済みなら全解除
    const newValue = someUnchecked;

    // すべてのソースのチェック状態を更新
    targetSources.forEach((source) => {
      newCheckedState[source.id] = newValue;
    });
    setCheckedSources(newCheckedState);

    // 全てのソースを更新中状態に追加
    setUpdatingSources(new Set(targetSources.map((source) => source.id)));

    // 各ソースの状態を更新
    targetSources.forEach(async (source) => {
      try {
        const sourceApi = SourceApi.getInstance();
        await sourceApi.updateSourceEnabled(source.id, newValue, {
          showAlert: true,
          throwError: true,
        });
      } catch (error) {
        // チェック状態を元に戻す
        setCheckedSources((prev) => ({
          ...prev,
          [source.id]: !newValue,
        }));
      } finally {
        // 完了したソースを更新中状態から削除
        setUpdatingSources((prev) => {
          const next = new Set(prev);
          next.delete(source.id);
          return next;
        });
      }
    });
  };

  // ソースデータの取得関数
  const fetchSources = useCallback(async () => {
    const sourceApi = SourceApi.getInstance();
    const responseSources = await sourceApi.getSources({
      showAlert: false,
      throwError: true,
    });
    const sourceList = responseSources || [];
    setSources(sourceList);
    const newProcessing = sourceList.some(
      (s: Source) => s.status === 'idle' || s.status === 'processing',
    );
    // 状態更新
    const enabledCount = sourceList.filter(
      (s: Source) => s.isEnabled === 1 && s.status === 'completed',
    ).length;
    onStatusUpdate({ processing: newProcessing, enabledCount });
  }, [onStatusUpdate]);

  // 初期データ読み込み（エラーが発生しなくなるまでポーリング）
  useEffect(() => {
    if (!open) return; // モーダルが開いていない場合は処理しない

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const loadSources = async () => {
      try {
        await fetchSources();

        // 読み込み成功したらポーリングを停止
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        console.error('ソース一覧の読み込みに失敗しました:', error);
        // 失敗時はポーリングを継続（既に設定済みの場合は何もしない）
        if (!intervalId) {
          intervalId = setInterval(loadSources, 5000);
        }
      }
    };

    // 初回読み込み
    loadSources();

    // クリーンアップでポーリング停止
    // eslint-disable-next-line consistent-return
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [open, fetchSources]);

  // ドキュメント更新時のポーリング処理
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (!reloadPolling) {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }

    const pollSources = async () => {
      try {
        await fetchSources();
      } catch (error) {
        console.error('ソース一覧のポーリング中にエラーが発生しました:', error);
      }
    };

    // ポーリング開始
    intervalId = setInterval(pollSources, 5000);

    // クリーンアップでポーリング停止
    // eslint-disable-next-line consistent-return
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [reloadPolling, sources, fetchSources]);

  const handleReloadClick = () => {
    setReloadPolling(true);
    onReloadSources();

    // 完了イベントの購読を開始（ワンショット）
    const sourceApi = SourceApi.getInstance();
    const unsubscribe = sourceApi.subscribeSourceReloadFinished(
      (payload: { success: boolean; error?: string }) => {
        // ドキュメント更新完了時にポーリングを停止
        setReloadPolling(false);

        fetchSources().catch((error) => {
          console.error('ソース一覧の更新に失敗しました:', error);
          addAlert({
            message: getSafeErrorMessage(
              error,
              '登録済みドキュメントの取得に失敗しました',
            ),
            severity: 'error',
          });
        });

        if (payload.success) {
          addAlert({
            message: 'ドキュメントの同期が完了しました',
            severity: 'success',
          });
        } else if (!payload.success) {
          addAlert({
            message: `ドキュメントの同期に失敗しました: ${
              payload.error || '不明なエラー'
            }`,
            severity: 'error',
          });
        }
        // 失敗時のエラーアラート表示はApp.tsxで行う
        // 処理完了と同時に購読解除
        unsubscribe();
      },
    );
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
          <Tooltip
            data-testid="sourcelistmodal-error-tooltip"
            title={error ?? '不明なエラー'}
          >
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
          登録ドキュメント一覧
        </Typography>
        <Alert severity="info" sx={{ whiteSpace: 'pre-line', mb: 2 }}>
          設定されたフォルダ内のドキュメントを一覧表示しています
          <br />
          選択されたドキュメントは、チャット機能において、AIの回答時に適宜参照されます
          <br />
          ※
          <br />
          フォルダの内容が更新された場合は、ファイル同期を実行してください
          <br />
          フォルダのパスは設定画面（歯車アイコン）から変更可能です
        </Alert>

        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title="ソース登録フォルダ内のファイル内容と同期します">
            <Button
              variant="contained"
              onClick={handleReloadClick}
              disabled={processing || updatingSources.size > 0}
              startIcon={<SyncIcon />}
            >
              {processing ? '同期処理中...' : 'ファイル同期'}
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
                <TableCell>同期処理ステータス</TableCell>
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
                        disabled={
                          processing ||
                          updatingSources.size > 0 ||
                          source.status !== 'completed'
                        }
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>{source.path}</TableCell>
                  <TableCell>{source.title}</TableCell>
                  <TableCell>
                    {getStatusIcon(source.status, source.error)}
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
