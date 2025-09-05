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
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Image as ImageIcon,
  Description as TextIcon,
  Help as HelpIcon,
  ViewAgenda as MergedIcon,
  ViewStream as PagesIcon,
} from '@mui/icons-material';
import { createHash } from 'crypto';

import {
  ReviewSourceModalProps,
  DocumentType,
  UploadFile,
  PdfProcessMode,
  PdfImageMode,
} from './types';

import { combineImages, convertPdfBytesToImages } from '../../lib/pdfUtils';
import { reviewService } from '../../services/reviewService';

const defaultCommentFormat =
  '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）';

function ReviewSourceModal({
  open,
  onClose,
  onSubmit,
  selectedReviewHistoryId,
  disabled,
  modalMode,
}: ReviewSourceModalProps): React.ReactElement {
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const [processing, setProcessing] = useState(false); // ★ 送信処理やPDF変換の進行中フラグ
  const [documentType, setDocumentType] = useState<DocumentType>('checklist');
  const [checklistRequirements, setChecklistRequirements] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [commentFormat, setCommentFormat] = useState(defaultCommentFormat);
  const [error, setError] = useState<string | null>(null); // ★ エラー表示用

  // modalMode, selectedReviewHistoryIdが変わったときに初期化し、保存された値を取得
  useEffect(() => {
    const loadSavedData = async () => {
      setUploadedFiles([]);
      setDocumentType('checklist');
      setChecklistRequirements('');
      setError(null);

      // レビューモードの場合、保存された追加指示とコメントフォーマットを取得
      if (modalMode === 'review' && selectedReviewHistoryId) {
        try {
          const result = await reviewService.getReviewHistoryDetail(
            selectedReviewHistoryId,
          );

          // 保存された値がある場合はそれを使用、なければデフォルト値を使用
          setAdditionalInstructions(result.additionalInstructions || '');
          setCommentFormat(result.commentFormat || defaultCommentFormat);
        } catch (error) {
          console.error('保存されたレビュー設定の取得に失敗:', error);
          // エラーが発生した場合はデフォルト値を使用
          setAdditionalInstructions('');
          setCommentFormat(defaultCommentFormat);
        }
      } else {
        // 抽出モードの場合はデフォルト値をセット
        setAdditionalInstructions('');
        setCommentFormat(defaultCommentFormat);
      }
    };

    loadSavedData();
  }, [modalMode, selectedReviewHistoryId]);

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

  const handleFileUpload = async () => {
    try {
      const result = await window.electron.fs.showOpenDialog({
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
            ],
          },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (!result.canceled && result.filePaths.length > 0) {
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
      setError('ファイル選択に失敗しました。もう一度お試しください。');
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

    setError(null);
    setProcessing(true);

    try {
      const filesReady = [];
      for (const f of uploadedFiles) {
        if (f.type === 'application/pdf' && f.pdfProcessMode === 'image') {
          // Mainから安全にPDFバイト列を取得（file:// fetch を使わない）
          const data = await window.electron.fs.readFile(f.path);

          // ブラウザ側で pdf.js にレンダリングさせて PNG を得る
          const imagePages = await convertPdfBytesToImages(data, {
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
        modalMode === 'review' && additionalInstructions.trim() !== ''
          ? additionalInstructions.trim()
          : undefined,
        modalMode === 'review' && commentFormat.trim() !== ''
          ? commentFormat.trim()
          : undefined,
      );
    } catch (e) {
      console.error('送信処理中に失敗:', e);
      setError(
        '送信時の処理に失敗しました。PDFが壊れていないか、またはPDFが非常に大きすぎないかをご確認ください。',
      );
    } finally {
      setProcessing(false);
    }
  };

  const getButtonText = () => {
    if (modalMode === 'review') return 'ドキュメントレビュー実行';
    if (modalMode === 'extract') return 'チェックリスト抽出';
    return null;
  };

  const getTitle = () => {
    if (modalMode === 'review') return 'レビュー対象ファイルのアップロード';
    if (modalMode === 'extract')
      return 'チェックリスト抽出対象ファイルのアップロード';
    return 'ファイルアップロード';
  };

  const getAlertMessage = () => {
    if (modalMode === 'extract') {
      return (
        <>
          ファイルを選択してチェックリスト抽出を実行できます
          <br />
          {documentType === 'checklist'
            ? '選択されたチェックリストドキュメントから、AIが既存のチェック項目を抽出できます'
            : '選択された一般ドキュメントから、AIがレビュー用のチェックリストを新規作成できます'}
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
        </>
      );
    }
    return null;
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

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

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

        {modalMode === 'review' && (
          <>
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
            {processing ? '処理中...' : getButtonText()}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}

export default React.memo(ReviewSourceModal);
