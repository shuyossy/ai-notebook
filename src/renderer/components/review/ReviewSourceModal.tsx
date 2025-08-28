import React, { useEffect, useState } from 'react';
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
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  TextField,
} from '@mui/material';
import {
  Check as CheckIcon,
  Error as ErrorIcon,
  Sync as SyncIcon,
  HourglassEmpty as ProcessingIcon,
  Help as UnknownIcon,
} from '@mui/icons-material';

import { Source } from '../../../db/schema';
import { ReviewSourceModalProps, DocumentType } from './types';

function SourceListModal({
  open,
  onClose,
  onSubmit,
  selectedReviewHistoryId,
  disabled,
  modalMode,
}: ReviewSourceModalProps): React.ReactElement {
  const [sources, setSources] = useState<Source[]>([]);
  const [checkedSources, setCheckedSources] = useState<{
    [key: number]: boolean;
  }>({});
  const [processing, setProcessing] = useState(true);
  const [documentType, setDocumentType] = useState<DocumentType>('checklist');
  const [checklistRequirements, setChecklistRequirements] = useState('');

  // チェック状態の更新
  // ソースの更新状態が変わったときにチェック状態を更新する
  // 元のチェック状態とマージする
  useEffect(() => {
    const newCheckedSources: { [key: number]: boolean } = {};
    sources.forEach((source) => {
      newCheckedSources[source.id] =
        source.status === 'completed'
          ? checkedSources[source.id] || false
          : false;
    });
    setCheckedSources(newCheckedSources);
    // eslint-disable-next-line
  }, [sources]);

  // modalMode, selectedReviewHistoryIdが変わったときにチェック状態を初期化する
  // checkedSourceを全てfalseにする
  useEffect(() => {
    setCheckedSources((prev) => {
      Object.keys(prev).forEach((key) => {
        prev[+key] = false;
      });
      return { ...prev };
    });
    // ドキュメント種別もリセット
    setDocumentType('checklist');
    // チェックリスト作成要件もリセット
    setChecklistRequirements('');
  }, [modalMode, selectedReviewHistoryId]);

  // チェックボックスの変更ハンドラ
  const handleSourceCheckChange = async (sourceId: number) => {
    setCheckedSources((prev) => ({
      ...prev,
      [sourceId]: !prev[sourceId],
    }));
  };

  // 全選択/全解除の切り替えハンドラ
  const handleSelectAllChange = () => {
    const targetSources = sources.filter(
      (source) => source.status === 'completed',
    );
    if (targetSources.length === 0) return;
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
        setProcessing(newProcessing);
      } catch (error) {
        console.error('ドキュメントデータの取得に失敗しました:', error);
      }
    };

    // 初回データ取得
    fetchSources();

    const intervalId = setInterval(fetchSources, 5000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const handleClick = () => {
    if (disabled) return;
    onSubmit(
      Object.keys(checkedSources)
        .filter((key) => {
          return checkedSources[+key];
        })
        .map((key) => +key),
      modalMode === 'extract' ? documentType : undefined,
      modalMode === 'extract' &&
        documentType === 'general' &&
        checklistRequirements.trim() !== ''
        ? checklistRequirements.trim()
        : undefined,
    );
  };

  const getButtonText = () => {
    if (modalMode === 'review') {
      return 'ドキュメントレビュー実行';
    }
    if (modalMode === 'extract') {
      return 'チェックリスト抽出';
    }
    return null;
  };

  const getTitle = () => {
    if (modalMode === 'review') {
      return 'ドキュメントレビュー対象ドキュメント選択';
    }
    if (modalMode === 'extract') {
      return 'チェックリスト抽出対象ドキュメント選択';
    }
    return 'ソース選択';
  };

  // アラート表示の内容
  const getAlertMessage = () => {
    if (modalMode === 'extract') {
      const baseMessage = (
        <>
          設定されたフォルダ内のドキュメントを一覧表示しています
          <br />
          {documentType === 'checklist'
            ? '選択されたチェックリストドキュメントから、AIが既存のチェック項目を抽出できます'
            : '選択された一般ドキュメントから、AIがレビュー用のチェックリストを新規作成できます'}
          <br />
          ※
          <br />
          フォルダの内容が更新された場合はドキュメント一覧画面（添付アイコン）からファイル同期を実行してください
          <br />
          チェックリストは手動で編集・追加・削除が可能です
          <br />
          手動で追加・編集されたチェックリスト以外は、再度チェックリスト抽出を実行すると削除されます
          <br />
          フォルダのパスは設定画面（歯車アイコン）から変更可能です
        </>
      );
      return baseMessage;
    }
    if (modalMode === 'review') {
      return (
        <>
          設定されたフォルダ内のドキュメントを一覧表示しています
          <br />
          選択されたドキュメントに対して、AIがチェックリストに基づいてレビューを行います
          <br />
          ※
          <br />
          フォルダの内容が更新された場合はドキュメント一覧画面（添付アイコン）からファイル同期を実行してください
          <br />
          フォルダのパスは設定画面（歯車アイコン）から変更可能です
        </>
      );
    }
    return null;
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
          {getTitle()}
        </Typography>
        <Alert severity="info" sx={{ whiteSpace: 'pre-line', mb: 2 }}>
          {getAlertMessage()}
        </Alert>

        {modalMode === 'extract' && (
          <>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <FormLabel component="legend">ドキュメント種別</FormLabel>
              <RadioGroup
                row
                value={documentType}
                onChange={(e) =>
                  setDocumentType(e.target.value as DocumentType)
                }
              >
                <FormControlLabel
                  value="checklist"
                  control={<Radio />}
                  label="チェックリストドキュメント（既存項目を抽出）"
                  disabled={processing}
                />
                <FormControlLabel
                  value="general"
                  control={<Radio />}
                  label="一般ドキュメント（新規チェックリスト作成）"
                  disabled={processing}
                />
              </RadioGroup>
            </FormControl>

            {documentType === 'general' && (
              <TextField
                fullWidth
                multiline
                rows={5}
                label="チェックリスト作成要件"
                placeholder="例：要件定義書をレビューするためのチェックリストを作成してください"
                value={checklistRequirements}
                onChange={(e) => setChecklistRequirements(e.target.value)}
                disabled={processing}
                sx={{ mb: 2 }}
                helperText="どのような観点でチェックリストを作成したいか具体的に記載してください（任意）"
              />
            )}
          </>
        )}

        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title="ソース登録ディレクトリ内のファイル内容と同期します">
            <Button
              variant="contained"
              onClick={handleClick}
              disabled={
                processing ||
                disabled ||
                Object.keys(checkedSources).length === 0
              }
              startIcon={<SyncIcon />}
            >
              {processing ? 'ドキュメント初期化処理中...' : getButtonText()}
            </Button>
          </Tooltip>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={
                      Object.values(checkedSources).some(
                        (checked) => checked,
                      ) &&
                      Object.values(checkedSources).some((checked) => !checked)
                    }
                    checked={
                      Object.values(checkedSources).length > 0 &&
                      Object.values(checkedSources).every((checked) => checked)
                    }
                    onChange={handleSelectAllChange}
                    disabled={processing}
                  />
                </TableCell>
                <TableCell>ファイルパス</TableCell>
                <TableCell>タイトル（生成）</TableCell>
                <TableCell>フォルダ同期処理ステータス</TableCell>
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
                    <Checkbox
                      checked={checkedSources[source.id] || false}
                      onChange={() => handleSourceCheckChange(source.id)}
                      disabled={processing || source.status !== 'completed'}
                    />
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
