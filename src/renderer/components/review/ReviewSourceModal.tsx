import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Box,
  Typography,
  Button,
  Paper,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  CircularProgress,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Image as ImageIcon,
  Description as TextIcon,
  Help as HelpIcon,
  ViewAgenda as MergedIcon,
  ViewStream as PagesIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import {
  DocumentType,
  UploadFile,
  PdfProcessMode,
  PdfImageMode,
  EvaluationItem,
  DocumentMode,
} from '@/types';
import { useAlertStore } from '@/renderer/stores/alertStore';
import { getSafeErrorMessage } from '../../lib/error';
import { ReviewSourceModalProps } from './types';
import { FsApi } from '../../service/fsApi';

import { combineImages, convertPdfBytesToImages } from '../../lib/pdfUtils';

const getMimeTypeFromExtension = (extension: string): string => {
  const mimeTypes: { [key: string]: string } = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

const getButtonText = (modalMode: ReviewSourceModalProps['modalMode']) => {
  if (modalMode === 'review') return 'ドキュメントレビュー実行';
  if (modalMode === 'extract') return 'チェックリスト抽出';
  return null;
};

const getTitle = (modalMode: ReviewSourceModalProps['modalMode']) => {
  if (modalMode === 'review') return 'レビュー対象ファイルのアップロード';
  if (modalMode === 'extract')
    return 'チェックリスト抽出対象ファイルのアップロード';
  return 'ファイルアップロード';
};

const getAlertMessage = ({
  modalMode,
  documentType,
}: {
  modalMode: ReviewSourceModalProps['modalMode'];
  documentType: DocumentType;
}) => {
  if (modalMode === 'extract') {
    return (
      <>
        ファイルを選択してチェックリスト抽出を実行できます
        <br />
        {documentType === 'checklist-csv'
          ? '選択したExcelまたはCSVファイルの一列目の値を全てチェックリスト項目として抽出します'
          : documentType === 'checklist-ai'
            ? '選択されたチェックリストドキュメントから、AIが既存のチェック項目を抽出できます'
            : '選択された一般ドキュメントから、AIがレビュー用のチェックリストを新規作成できます'}
        <br />
        複数ファイルを選択した場合、選択した順番で結合され一つのドキュメントとして扱われます
        <br />
        ※
        <br />
        チェックリストは手動で編集・追加・削除が可能です
        <br />
        手動で追加・編集されたチェックリスト以外は、再度チェックリスト抽出を実行すると削除されます
      </>
    );
  }
  if (modalMode === 'review') {
    return (
      <>
        レビュー対象ファイルを選択してください
        <br />
        選択されたドキュメントに対して、AIがチェックリストに基づいてレビューを行います
        <br />
        複数ファイルを選択した場合、選択した順番で結合され一つのドキュメントとして扱われます
      </>
    );
  }
  return null;
};

function ReviewSourceModal({
  open,
  onClose,
  onSubmit,
  selectedReviewHistoryId,
  disabled,
  modalMode,
  additionalInstructions,
  setAdditionalInstructions,
  commentFormat,
  setCommentFormat,
  evaluationSettings,
  setEvaluationSettings,
}: ReviewSourceModalProps): React.ReactElement {
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const [processing, setProcessing] = useState(false); // ★ 送信処理やPDF変換の進行中フラグ
  const [documentType, setDocumentType] =
    useState<DocumentType>('checklist-ai');
  const [checklistRequirements, setChecklistRequirements] = useState('');
  const [documentVolumeType, setDocumentVolumeType] = useState<DocumentMode>('small');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<EvaluationItem>({
    label: '',
    description: '',
  });

  const addAlert = useAlertStore((state) => state.addAlert);

  // modalMode, selectedReviewHistoryIdが変わったときに初期化し、保存された値を取得
  useEffect(() => {
    const loadSavedData = async () => {
      setUploadedFiles([]);
      setDocumentType('checklist-ai');
      setChecklistRequirements('');
      setDocumentVolumeType('small');
    };

    loadSavedData();
  }, [modalMode, selectedReviewHistoryId]);

  const handleFileUpload = async () => {
    try {
      const fsApi = FsApi.getInstance();
      const result = await fsApi.showOpenDialog(
        {
          title: 'ドキュメントファイルを選択',
          filters: [
            {
              name: 'ドキュメントファイル',
              extensions: [
                'pdf',
                'doc',
                'docx',
                'xls',
                'xlsx',
                'ppt',
                'pptx',
                'txt',
                'csv',
              ],
            },
          ],
          properties: ['openFile', 'multiSelections'],
        },
        {
          showAlert: true,
          throwError: true,
        },
      );

      if (result && !result.canceled && result.filePaths.length > 0) {
        const newFiles: UploadFile[] = result.filePaths.map(
          (filePath: string) => {
            const fileName = filePath.split(/[/\\]/).pop() || filePath;
            const fileExtension =
              fileName.split('.').pop()?.toLowerCase() || '';
            const mimeType = getMimeTypeFromExtension(fileExtension);

            return {
              id: filePath,
              name: fileName,
              path: filePath,
              type: mimeType,
              // ★ 画像化は最終決定時だけ行うので、ここでは mode だけ持つ
              pdfProcessMode:
                mimeType === 'application/pdf' ? 'text' : undefined,
              pdfImageMode: 'merged', // デフォルトは統合画像
            };
          },
        );

        setUploadedFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (e) {
      console.error('ファイル選択エラー:', e);
      addAlert({
        message: getSafeErrorMessage(e, 'ファイル選択に失敗しました'),
        severity: 'error',
      });
    }
  };

  const handleFileDelete = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  // ★ ここでは「モード切替」だけ。実際のPDF→画像変換は送信確定時にまとめて行う
  const handlePdfProcessModeChange = (fileId: string, mode: PdfProcessMode) => {
    setUploadedFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? { ...file, pdfProcessMode: mode, imageData: undefined }
          : file,
      ),
    );
  };

  // PDF画像化モードを変更するハンドラー
  const handlePdfImageModeChange = (fileId: string, mode: PdfImageMode) => {
    setUploadedFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? { ...file, pdfImageMode: mode, imageData: undefined }
          : file,
      ),
    );
  };

  // 評価項目の追加
  const handleAddEvaluationItem = () => {
    setEditingItemIndex(-1); // -1は新規追加を表す
    setEditingItem({ label: '', description: '' });
  };

  // 評価項目の編集開始
  const handleEditEvaluationItem = (index: number) => {
    setEditingItemIndex(index);
    setEditingItem({ ...evaluationSettings.items[index] });
  };

  // 評価項目の編集キャンセル
  const handleCancelEditEvaluationItem = () => {
    setEditingItemIndex(null);
    setEditingItem({ label: '', description: '' });
  };

  // 評価項目の保存
  const handleSaveEvaluationItem = () => {
    if (!editingItem.label.trim() || !editingItem.description.trim()) {
      addAlert({
        message: 'すべての項目を入力してください',
        severity: 'warning',
      });
      return;
    }

    const newItems = [...evaluationSettings.items];
    if (editingItemIndex === -1) {
      // 新規追加
      newItems.push(editingItem);
    } else if (editingItemIndex !== null) {
      // 編集
      newItems[editingItemIndex] = editingItem;
    }

    setEvaluationSettings({ items: newItems });
    setEditingItemIndex(null);
    setEditingItem({ label: '', description: '' });
  };

  // 評価項目の削除
  const handleDeleteEvaluationItem = (index: number) => {
    const newItems = evaluationSettings.items.filter((_, i) => i !== index);
    if (newItems.length === 0) {
      addAlert({
        message: '少なくとも1つの評定項目が必要です',
        severity: 'warning',
      });
      return;
    }
    setEvaluationSettings({ items: newItems });
  };

  // デバッグ専用：DataURLを即ダウンロード
  // 本番環境ではコメントアウトすること
  // const __dbgDownload = (dataUrl: string, name = 'converted.png') => {
  //   const a = document.createElement('a');
  //   a.href = dataUrl;
  //   a.download = name;
  //   a.click();
  // };

  // ★ 送信確定時にだけ、必要なPDFをMain経由で読み→Rendererで画像化→連結
  const handleSubmit = async () => {
    if (disabled || processing || uploadedFiles.length === 0) return;

    // CSVインポート選択時のファイル形式チェック
    if (modalMode === 'extract' && documentType === 'checklist-csv') {
      const nonCsvFiles = uploadedFiles.filter(
        (file) =>
          !file.name.toLowerCase().endsWith('.csv') &&
          !file.name.toLowerCase().endsWith('.xlsx') &&
          !file.name.toLowerCase().endsWith('.xls'),
      );
      if (nonCsvFiles.length > 0) {
        addAlert({
          message:
            'ファイルインポートを選択している場合はExcelまたはCSVファイルのみ指定可能です',
          severity: 'error',
        });
        return;
      }
    }

    setProcessing(true);

    try {
      const filesReady = [];
      for (const f of uploadedFiles) {
        if (f.type === 'application/pdf' && f.pdfProcessMode === 'image') {
          // Mainから安全にPDFバイト列を取得（file:// fetch を使わない）
          const fsApi = FsApi.getInstance();
          const data = await fsApi.readFile(f.path, {
            showAlert: false,
            throwError: true,
          });

          // ブラウザ側で pdf.js にレンダリングさせて PNG を得る
          const imagePages = await convertPdfBytesToImages(data!, {
            scale: 2.0,
          });

          if (f.pdfImageMode === 'pages') {
            // ページ別画像モード: 各ページを個別に保存
            // デバッグ用：各ページを個別にダウンロード
            // imagePages.forEach((_pageImage, _index) => {
            //   // ←ここで即保存（デバッグ用）
            //   // 本番はコメントアウトすること
            //   __dbgDownload(
            //     pageImage,
            //     `${f.name.replace(/\.[^.]+$/, '')}_page_${index + 1}.png`,
            //   );
            // });

            filesReady.push({ ...f, imageData: imagePages });
          } else {
            // 統合画像モード（デフォルト): 1つの縦長PNGに連結
            const combined = await combineImages(imagePages);

            // ←ここで即保存（デバッグ用）
            // 本番はコメントアウトすること
            // __dbgDownload(
            //   combined,
            //   f.name.replace(/\.[^.]+$/, '') + '_combined.png',
            // );

            filesReady.push({ ...f, imageData: [combined] });
          }
        } else {
          filesReady.push(f);
        }
      }

      // 呼び出し元に最終決定のファイルリストを渡す（必要ならこの先でMainに送る）
      onSubmit(
        filesReady,
        modalMode === 'extract' ? documentType : undefined,
        modalMode === 'extract' &&
          documentType === 'general' &&
          checklistRequirements.trim() !== ''
          ? checklistRequirements.trim()
          : undefined,
        modalMode === 'review' ? documentVolumeType : undefined,
        modalMode === 'review' && additionalInstructions.trim() !== ''
          ? additionalInstructions.trim()
          : undefined,
        modalMode === 'review' && commentFormat.trim() !== ''
          ? commentFormat.trim()
          : undefined,
        modalMode === 'review' ? evaluationSettings : undefined,
      );
    } catch (e) {
      console.error('送信処理中に失敗:', e);
      addAlert({
        message: getSafeErrorMessage(e, 'ファイルの送信処理に失敗しました'),
        severity: 'error',
      });
    } finally {
      setProcessing(false);
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
          {getTitle(modalMode)}
        </Typography>

        <Alert severity="info" sx={{ whiteSpace: 'pre-line', mb: 2 }}>
          {getAlertMessage({ modalMode, documentType })}
        </Alert>

        {modalMode === 'extract' && (
          <>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <FormLabel component="legend">ドキュメント種別</FormLabel>
              <RadioGroup
                value={documentType}
                onChange={(e) =>
                  setDocumentType(e.target.value as DocumentType)
                }
              >
                <FormControlLabel
                  value="checklist-ai"
                  control={<Radio />}
                  label="チェックリストドキュメント（AI抽出）"
                  disabled={processing}
                />
                <FormControlLabel
                  value="checklist-csv"
                  control={<Radio />}
                  label={
                    <Tooltip title="選択したファイル(Excel,CSV)の一列目の値を全てチェックリスト項目として抽出します">
                      <span>
                        チェックリストドキュメント（ファイルインポート）
                      </span>
                    </Tooltip>
                  }
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

        {modalMode === 'review' && (
          <>
            <FormControl component="fieldset" sx={{ mb: 2 }}>
              <FormLabel component="legend">ドキュメント量</FormLabel>
              <RadioGroup
                value={documentVolumeType}
                onChange={(e) =>
                  setDocumentVolumeType(e.target.value as 'small' | 'large')
                }
              >
                <FormControlLabel
                  value="small"
                  control={<Radio />}
                  label={
                    <Tooltip title="選択されたドキュメントを全てそのままAIの入力コンテキストに与えてレビューを行います。ドキュメント量が少ない場合に選択してください。">
                      <span>
                        少量ドキュメント
                        <HelpIcon
                          fontSize="small"
                          sx={{ ml: 0.5, color: 'text.secondary' }}
                        />
                      </span>
                    </Tooltip>
                  }
                  disabled={processing}
                />
                <FormControlLabel
                  value="large"
                  control={<Radio />}
                  label={
                    <Tooltip title="ドキュメントを直接AIに入力するのではなく、個々のドキュメントの要約や分析を実行して整理し、最終的にレビューを行います。ドキュメント量が多い場合に選択してください。">
                      <span>
                        大量ドキュメント
                        <HelpIcon
                          fontSize="small"
                          sx={{ ml: 0.5, color: 'text.secondary' }}
                        />
                      </span>
                    </Tooltip>
                  }
                  disabled={processing}
                />
              </RadioGroup>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="追加指示"
              placeholder="例：特に技術的な観点から厳しくレビューしてください"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              disabled={processing}
              sx={{ mb: 2 }}
              helperText="AIに対してレビューの進め方の追加指示がある場合は記載してください（任意）"
            />

            <TextField
              fullWidth
              multiline
              rows={4}
              label="コメントフォーマット"
              value={commentFormat}
              onChange={(e) => setCommentFormat(e.target.value)}
              disabled={processing}
              sx={{ mb: 2 }}
              helperText="AIがレビューコメントを記載する際のフォーマットを指定してください"
            />

            <Accordion sx={{ mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1">評定項目設定</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    レビューで使用する評定項目を設定できます
                  </Typography>

                  {/* 評定項目一覧 */}
                  {evaluationSettings.items.map((item, index) => (
                    <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                      {editingItemIndex === index ? (
                        // 編集モード
                        <Stack spacing={2}>
                          <TextField
                            label="評定ラベル"
                            value={editingItem.label}
                            onChange={(e) =>
                              setEditingItem((prev) => ({
                                ...prev,
                                label: e.target.value,
                              }))
                            }
                            size="small"
                            helperText="例: 優秀, 良好, 要改善"
                          />
                          <TextField
                            label="評定説明"
                            value={editingItem.description}
                            onChange={(e) =>
                              setEditingItem((prev) => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                            multiline
                            rows={2}
                            size="small"
                            helperText="この評定の意味を説明してください"
                          />
                          <Stack direction="row" spacing={1}>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={handleSaveEvaluationItem}
                            >
                              保存
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={handleCancelEditEvaluationItem}
                            >
                              キャンセル
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        // 表示モード
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Box>
                            <Typography
                              variant="body1"
                              component="span"
                              sx={{ fontWeight: 'bold', mr: 2 }}
                            >
                              {item.label}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {item.description}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1}>
                            <IconButton
                              size="small"
                              onClick={() => handleEditEvaluationItem(index)}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteEvaluationItem(index)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        </Stack>
                      )}
                    </Paper>
                  ))}

                  {/* 新規追加編集フォーム */}
                  {editingItemIndex === -1 && (
                    <Paper
                      variant="outlined"
                      sx={{ p: 2, border: '2px dashed' }}
                    >
                      <Stack spacing={2}>
                        <Typography variant="subtitle2">
                          新しい評定項目を追加
                        </Typography>
                        <TextField
                          label="評定ラベル"
                          value={editingItem.label}
                          onChange={(e) =>
                            setEditingItem((prev) => ({
                              ...prev,
                              label: e.target.value,
                            }))
                          }
                          size="small"
                          helperText="例: 優秀, 良好, 要改善"
                        />
                        <TextField
                          label="評定説明"
                          value={editingItem.description}
                          onChange={(e) =>
                            setEditingItem((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          multiline
                          rows={2}
                          size="small"
                          helperText="この評定の意味を説明してください"
                        />
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handleSaveEvaluationItem}
                          >
                            追加
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={handleCancelEditEvaluationItem}
                          >
                            キャンセル
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  )}

                  {/* 追加ボタン */}
                  {editingItemIndex === null && (
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleAddEvaluationItem}
                      disabled={processing}
                    >
                      評定項目を追加
                    </Button>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </>
        )}

        <Box sx={{ mb: 2 }}>
          <Button
            variant="contained"
            onClick={handleFileUpload}
            startIcon={<UploadIcon />}
            disabled={processing}
          >
            ファイル選択ダイアログ
          </Button>
        </Box>

        {uploadedFiles.length > 0 && (
          <Paper sx={{ mb: 2, p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              選択済みファイル ({uploadedFiles.length}件)
            </Typography>
            <List dense>
              {uploadedFiles.map((file) => (
                <ListItem
                  key={file.id}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={() => handleFileDelete(file.id)}
                      disabled={processing}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={file.name}
                    secondary={file.type === 'application/pdf' ? 'PDF' : ''}
                  />
                  {file.type === 'application/pdf' && (
                    <Box sx={{ mr: 2 }}>
                      <FormControl size="small">
                        <RadioGroup
                          row
                          value={file.pdfProcessMode}
                          onChange={(e) =>
                            handlePdfProcessModeChange(
                              file.id,
                              e.target.value as PdfProcessMode,
                            )
                          }
                        >
                          <FormControlLabel
                            value="text"
                            control={<Radio size="small" />}
                            label={
                              <Box
                                sx={{ display: 'flex', alignItems: 'center' }}
                              >
                                <TextIcon fontSize="small" sx={{ mr: 0.5 }} />
                                テキスト
                              </Box>
                            }
                          />
                          <FormControlLabel
                            value="image"
                            control={<Radio size="small" />}
                            label={
                              <Box
                                sx={{ display: 'flex', alignItems: 'center' }}
                              >
                                <ImageIcon fontSize="small" sx={{ mr: 0.5 }} />
                                画像
                                <Tooltip title="図形オブジェクトが多いPDFは画像化で精度が上がる場合があります">
                                  <HelpIcon
                                    fontSize="small"
                                    sx={{ ml: 0.5, color: 'text.secondary' }}
                                  />
                                </Tooltip>
                              </Box>
                            }
                          />
                        </RadioGroup>
                      </FormControl>
                      {file.pdfProcessMode === 'image' && (
                        <FormControl size="small" sx={{ ml: 1 }}>
                          <RadioGroup
                            row
                            value={file.pdfImageMode}
                            onChange={(e) =>
                              handlePdfImageModeChange(
                                file.id,
                                e.target.value as PdfImageMode,
                              )
                            }
                          >
                            <FormControlLabel
                              value="merged"
                              control={<Radio size="small" />}
                              label={
                                <Box
                                  sx={{ display: 'flex', alignItems: 'center' }}
                                >
                                  <MergedIcon
                                    fontSize="small"
                                    sx={{ mr: 0.5 }}
                                  />
                                  統合画像
                                </Box>
                              }
                            />
                            <FormControlLabel
                              value="pages"
                              control={<Radio size="small" />}
                              label={
                                <Box
                                  sx={{ display: 'flex', alignItems: 'center' }}
                                >
                                  <PagesIcon
                                    fontSize="small"
                                    sx={{ mr: 0.5 }}
                                  />
                                  ページ別画像
                                  <Tooltip title="ページ数が多い場合はページごとに画像化することを検討してください">
                                    <HelpIcon
                                      fontSize="small"
                                      sx={{ ml: 0.5, color: 'text.secondary' }}
                                    />
                                  </Tooltip>
                                </Box>
                              }
                            />
                          </RadioGroup>
                        </FormControl>
                      )}
                    </Box>
                  )}
                </ListItem>
              ))}
            </List>
          </Paper>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button variant="outlined" onClick={onClose} disabled={processing}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={processing || disabled || uploadedFiles.length === 0}
            startIcon={processing ? <CircularProgress size={20} /> : null}
          >
            {processing ? '処理中...' : getButtonText(modalMode)}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

export default React.memo(ReviewSourceModal);
