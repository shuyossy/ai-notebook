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
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Help as HelpIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  Download as DownloadIcon,
  InfoOutlined as InfoOutlinedIcon,
} from '@mui/icons-material';
import Backdrop from '@mui/material/Backdrop';
import {
  DocumentType,
  UploadFile,
  ProcessMode,
  ImageMode,
  EvaluationItem,
  DocumentMode,
} from '@/types';
import { useAlertStore } from '@/renderer/stores/alertStore';
import { getSafeErrorMessage } from '../../lib/error';
import { ReviewSourceModalProps } from './types';
import { FsApi } from '../../service/fsApi';
import { ReviewApi } from '../../service/reviewApi';

import { combineImages, convertPdfBytesToImages } from '../../lib/pdfUtils';
import {
  getMimeTypeFromExtension,
  supportsImageExtraction,
} from '../../lib/fileUtils';

// ドキュメントが画像化に対応しているかチェック
const supportsImageProcessing = (mimeType: string): boolean => {
  const supportedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  return supportedTypes.includes(mimeType);
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
        {documentType === 'checklist-csv' ? (
          <>
            選択したExcelまたはCSVファイルから以下の情報をインポートすることができます：
            <br />
            ・チェックリスト項目
            <br />
            ・評定設定（評定ラベルと説明）
            <br />
            ・追加指示・コメントフォーマット
            <br />
            ・AI API設定（エンドポイント、APIキー、モデル名、ユーザID）
            <br />
            <br />
            <strong>ファイル形式:</strong>
            <br />
            1行目:
            ヘッダ行（チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI
            APIエンドポイント,AI APIキー,モデル名,ユーザID）：必須
            <br />
            2行目以降: データ行：任意
            <br />
            ※
            <br />
            ・チェックリスト列に値がある場合→チェックリスト項目として認識
            <br />
            ・評定ラベル列＋評定説明列の両方に値がある場合→評定設定値として認識
            <br />
            ・追加指示・コメントフォーマット・AI
            API・モデル名・ユーザID列に値がある場合→各種設定値として認識
            <br />
            ・空セルは無視
            <br />
          </>
        ) : documentType === 'checklist-ai' ? (
          '選択されたチェックリストドキュメントから、AIが既存のチェック項目を抽出できます'
        ) : (
          '選択された一般ドキュメントから、AIがレビュー用のチェックリストを新規作成できます'
        )}
        {documentType !== 'checklist-csv' && (
          <>
            <br />
            複数ファイルを選択した場合、選択した順番で結合され一つのドキュメントとして扱われます
          </>
        )}
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

// 一括設定用の処理モード型定義（2択: テキスト抽出 / 画像化）
type BulkProcessMode = 'text' | 'image';

// 変換進捗情報の型定義
type ConversionProgress = {
  currentFileName: string;
  conversionType: 'pdf' | 'image';
  currentIndex: number;
  totalCount: number;
  progressDetail?: {
    type: 'sheet-setup' | 'pdf-export';
    sheetName?: string;
    currentSheet?: number;
    totalSheets?: number;
  };
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
  const [conversionProgress, setConversionProgress] =
    useState<ConversionProgress | null>(null); // 変換進捗情報
  const [documentType, setDocumentType] =
    useState<DocumentType>('checklist-ai');
  const [checklistRequirements, setChecklistRequirements] = useState('');
  const [documentVolumeType, setDocumentVolumeType] =
    useState<DocumentMode>('auto');
  const [concurrentChecklistCount, setConcurrentChecklistCount] = useState(1);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<EvaluationItem>({
    label: '',
    description: '',
  });
  const [bulkProcessMode, setBulkProcessMode] =
    useState<BulkProcessMode>('text');
  const [bulkImageMode, setBulkImageMode] = useState<ImageMode>('pages');
  const [bulkIncludeImages, setBulkIncludeImages] = useState<boolean>(false);

  const addAlert = useAlertStore((state) => state.addAlert);

  // テンプレートCSVダウンロード
  const handleDownloadTemplate = () => {
    // テンプレートCSVの内容を生成
    const templateLines = [
      // ヘッダ行
      'チェックリスト,評定ラベル,評定説明,追加指示,コメントフォーマット,AI APIエンドポイント,AI APIキー,モデル名,ユーザID',
      // データ行
      'チェックリストサンプル1,A,基準を完全に満たしている,レビューは厳格に実施してください。,"【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）",http://localhost:11434/v1,your-api-key,llama3,user001',
      'チェックリストサンプル2,B,基準をある程度満たしている,,,,,',
      'チェックリストサンプル3,C,基準を満たしていない,,,,,',
      ',-,評価の対象外、または評価できない,,,,,,',
    ];

    const csvContent = templateLines.join('\n');

    // BOM付きでダウンロード
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csvContent;
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'チェックリストインポートテンプレート.csv';
    document.body.appendChild(link);
    link.click();

    // クリーンアップ
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // modalMode, selectedReviewHistoryIdが変わったときに初期化し、保存された値を取得
  useEffect(() => {
    const loadSavedData = async () => {
      setUploadedFiles([]);
      setDocumentType('checklist-ai');
      setChecklistRequirements('');
      setDocumentVolumeType('auto');
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
                'md',
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
              // 常にtextをデフォルトに; ユーザーは対応ファイルなら画像に変更可能
              processMode: 'text',
              imageMode: 'pages', // デフォルトはページ単位
              // 画像抽出対応ファイルの場合、デフォルトは画像を含めない
              includeImages: supportsImageExtraction(fileName)
                ? false
                : undefined,
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

  // ドキュメント処理モード切替ハンドラー
  const handleProcessModeChange = (fileId: string, mode: ProcessMode) => {
    setUploadedFiles((prev) =>
      prev.map((file) => {
        if (file.id !== fileId) return file;
        if (mode === 'image') {
          // 画像モードに切り替え時はincludeImagesをundefinedにリセット
          return {
            ...file,
            processMode: mode,
            imageData: undefined,
            includeImages: undefined,
          };
        }
        // テキストモードに切り替え時はincludeImagesをfalseにリセット
        return {
          ...file,
          processMode: mode,
          imageData: undefined,
          includeImages: supportsImageExtraction(file.name) ? false : undefined,
        };
      }),
    );
  };

  // テキスト抽出時の画像を含めるかどうかの切替ハンドラー
  const handleIncludeImagesChange = (fileId: string, checked: boolean) => {
    setUploadedFiles((prev) =>
      prev.map((file) =>
        file.id === fileId ? { ...file, includeImages: checked } : file,
      ),
    );
  };

  // ドキュメント画像化モードを変更するハンドラー
  const handleImageModeChange = (fileId: string, mode: ImageMode) => {
    setUploadedFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? { ...file, imageMode: mode, imageData: undefined }
          : file,
      ),
    );
  };

  // 一括設定を全ファイルに適用するハンドラー
  const handleApplyBulkSettings = () => {
    if (uploadedFiles.length === 0) {
      addAlert({
        message: '適用対象のファイルがありません',
        severity: 'warning',
      });
      return;
    }

    setUploadedFiles((prev) =>
      prev.map((file) => {
        if (bulkProcessMode === 'text') {
          // テキストモード: 画像化非対応ファイルでもincludeImages適用
          if (!supportsImageProcessing(file.type)) {
            if (supportsImageExtraction(file.name)) {
              return { ...file, includeImages: bulkIncludeImages };
            }
            return file;
          }
          return {
            ...file,
            processMode: 'text',
            imageData: undefined,
            includeImages: supportsImageExtraction(file.name)
              ? bulkIncludeImages
              : undefined,
          };
        } else {
          // 画像化モード: 画像化非対応ファイルはスキップ
          if (!supportsImageProcessing(file.type)) {
            return file;
          }
          return {
            ...file,
            processMode: 'image',
            imageMode: bulkImageMode,
            imageData: undefined,
            includeImages: undefined,
          };
        }
      }),
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

    // PDF変換進捗イベントの購読を開始
    const reviewApi = ReviewApi.getInstance();
    const unsubscribe = await reviewApi.subscribeOfficeToPdfProgress(
      (payload) => {
        const { fileName, progressType, sheetName, currentSheet, totalSheets } =
          payload;

        // 現在処理中のファイルのインデックスを探す
        const currentIndex = uploadedFiles.findIndex(
          (f) => f.name === fileName,
        );

        if (progressType === 'sheet-setup' && sheetName) {
          setConversionProgress({
            currentFileName: fileName,
            conversionType: 'pdf',
            currentIndex: currentIndex + 1,
            totalCount: uploadedFiles.length,
            progressDetail: {
              type: 'sheet-setup',
              sheetName,
              currentSheet,
              totalSheets,
            },
          });
        }

        if (progressType === 'pdf-export') {
          setConversionProgress({
            currentFileName: fileName,
            conversionType: 'pdf',
            currentIndex: currentIndex + 1,
            totalCount: uploadedFiles.length,
            progressDetail: {
              type: 'pdf-export',
            },
          });
        }
      },
    );

    try {
      const filesReady = [];
      const fsApi = FsApi.getInstance();
      const totalFiles = uploadedFiles.length;

      for (let i = 0; i < uploadedFiles.length; i++) {
        const f = uploadedFiles[i];

        // 画像化モードの場合
        if (f.processMode === 'image') {
          let pdfData: Uint8Array;

          // PDF以外の場合は、まずOffice→PDFに変換
          if (f.type !== 'application/pdf') {
            // 進捗状態を更新: PDF変換中（詳細はイベントで更新される）
            setConversionProgress({
              currentFileName: f.name,
              conversionType: 'pdf',
              currentIndex: i + 1,
              totalCount: totalFiles,
            });

            pdfData = (await fsApi.convertOfficeToPdf(f.path, {
              showAlert: false,
              throwError: true,
            }))!;
          } else {
            // PDFの場合は直接読み込み
            pdfData = (await fsApi.readFile(f.path, {
              showAlert: false,
              throwError: true,
            }))!;
          }

          // 進捗状態を更新: 画像化中
          setConversionProgress({
            currentFileName: f.name,
            conversionType: 'image',
            currentIndex: i + 1,
            totalCount: totalFiles,
          });

          // ブラウザ側で pdf.js にレンダリングさせて PNG を得る
          const imagePages = await convertPdfBytesToImages(pdfData, {
            scale: 2.0,
          });

          if (f.imageMode === 'pages') {
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
          // テキスト抽出モードまたは画像化非対応ファイル
          filesReady.push(f);
        }
      }

      // 変換完了後、進捗状態をクリア
      setConversionProgress(null);

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
        modalMode === 'review' ? concurrentChecklistCount : undefined,
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
      // イベント購読を解除
      unsubscribe();
      setProcessing(false);
      setConversionProgress(null);
    }
  };

  // モーダルクローズハンドラー（変換処理中は閉じられないように制御）
  const handleClose = () => {
    if (processing) {
      // 変換処理中はモーダルを閉じない
      return;
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <>
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
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <span>
                          チェックリストドキュメント（ファイルインポート）
                        </span>
                        <Tooltip title="インポート用テンプレートファイルをダウンロード">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadTemplate();
                            }}
                            disabled={processing}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
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
                <FormLabel component="legend">レビュー方法</FormLabel>
                <RadioGroup
                  value={documentVolumeType}
                  onChange={(e) =>
                    setDocumentVolumeType(e.target.value as DocumentMode)
                  }
                >
                  <FormControlLabel
                    value="auto"
                    control={<Radio />}
                    label={
                      <Tooltip title="AIへの入力データ量に応じて、文書一括・分割のどちらで処理するかを自動で判定します。">
                        <span>
                          自動判定
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
                    value="small"
                    control={<Radio />}
                    label={
                      <Tooltip title="選択されたドキュメントを全てそのままAIの入力コンテキストに与えてレビューを行います。ドキュメント量が少ない場合に選択してください。">
                        <span>
                          文書一括
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
                      <Tooltip title="個々のドキュメントをAIの入力コンテキストに収まるまで分割してレビューを実行し、最終的にこれらの結果を統合します。ドキュメント量が多い場合に選択してください。">
                        <span>
                          文書分割
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
                type="number"
                label="同時レビュー項目数"
                value={concurrentChecklistCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    setConcurrentChecklistCount(val);
                  }
                }}
                inputProps={{ min: 1 }}
                disabled={processing}
                sx={{ mb: 2 }}
                helperText="AIが一度にレビューするチェック項目数。数が大きいほどレビュー完了までの時間が短くなり、API発行回数も少なくなりますが、レビュー品質が低下する可能性があります"
              />

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
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
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
                                onClick={() =>
                                  handleDeleteEvaluationItem(index)
                                }
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

              {/* テキスト抽出の説明 */}
              {documentType !== 'checklist-csv' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 'bold', mb: 0.5 }}
                  >
                    テキスト表現について
                  </Typography>
                  <Typography variant="body2">
                    ファイル内のテキスト情報に加えて、以下の情報にアクセス可能な場合は自動的に取得します：
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    <Typography component="li" variant="body2">
                      Word・PDF：挿入された画像・図形情報（図形内テキスト）
                    </Typography>
                    <Typography component="li" variant="body2">
                      Excel・PowerPoint：挿入された画像・図形情報（図形内テキスト・種類・大きさ・座標）
                    </Typography>
                  </Box>
                </Alert>
              )}

              {/* 一括設定セクション */}
              {documentType !== 'checklist-csv' && (
                <Paper
                  sx={{
                    p: 2,
                    mb: 2,
                    bgcolor: 'action.hover',
                    border: '1px solid',
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 'bold', mb: 1.5 }}
                  >
                    一括設定
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    flexWrap="wrap"
                  >
                    {/* 処理方法Select */}
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel id="bulk-process-mode-label">
                        変換形式
                      </InputLabel>
                      <Select
                        labelId="bulk-process-mode-label"
                        label="変換形式"
                        value={bulkProcessMode}
                        onChange={(e) =>
                          setBulkProcessMode(e.target.value as BulkProcessMode)
                        }
                        disabled={processing}
                      >
                        <MenuItem value="text">テキスト表現</MenuItem>
                        <MenuItem value="image">画像</MenuItem>
                      </Select>
                    </FormControl>

                    {/* サブオプションSelect（条件付き表示） */}
                    {bulkProcessMode === 'text' ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                          <InputLabel id="bulk-include-images-label">
                            画像オプション
                          </InputLabel>
                          <Select
                            labelId="bulk-include-images-label"
                            label="画像オプション"
                            value={bulkIncludeImages ? 'include' : 'exclude'}
                            onChange={(e) =>
                              setBulkIncludeImages(e.target.value === 'include')
                            }
                            disabled={processing}
                          >
                            <MenuItem value="exclude">画像を含めない</MenuItem>
                            <MenuItem value="include">画像を含める</MenuItem>
                          </Select>
                        </FormControl>
                        <Tooltip title="ファイル内に挿入された画像もテキスト表現に含めるかどうか選択できます。画像が多いファイルではコンテキスト消費量が増え、精度の低下や文書一括レビューの失敗につながる場合があります。">
                          <InfoOutlinedIcon
                            fontSize="small"
                            sx={{
                              color: 'text.secondary',
                              cursor: 'help',
                            }}
                            data-testid="bulk-image-option-info"
                          />
                        </Tooltip>
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                          <InputLabel id="bulk-image-mode-label">
                            画像化方式
                          </InputLabel>
                          <Select
                            labelId="bulk-image-mode-label"
                            label="画像化方式"
                            value={bulkImageMode}
                            onChange={(e) =>
                              setBulkImageMode(e.target.value as ImageMode)
                            }
                            disabled={processing}
                          >
                            <MenuItem value="pages">ページごと</MenuItem>
                            <MenuItem value="merged">統合</MenuItem>
                          </Select>
                        </FormControl>
                        <Tooltip title="「統合」: 全ページを1つの縦長画像として統合します。AIモデルは画像を一定の大きさに圧縮して読み込むので、ページ数が多い場合は利用しないでください。「ページごと」: 各ページを個別の画像として処理します。office文書の場合はPDFに変換してから画像化します。">
                          <InfoOutlinedIcon
                            fontSize="small"
                            sx={{
                              color: 'text.secondary',
                              cursor: 'help',
                            }}
                            data-testid="bulk-image-mode-info"
                          />
                        </Tooltip>
                      </Stack>
                    )}

                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleApplyBulkSettings}
                      disabled={processing}
                    >
                      すべてに適用
                    </Button>
                  </Stack>
                </Paper>
              )}

              {/* ファイルリスト */}
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
                      sx={{ flex: '0 1 auto', mr: 2 }}
                    />
                    {supportsImageProcessing(file.type) &&
                    documentType !== 'checklist-csv' ? (
                      <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="center"
                        sx={{ mr: 2 }}
                      >
                        {/* 処理方法Select */}
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                          <Select
                            value={file.processMode}
                            onChange={(e) =>
                              handleProcessModeChange(
                                file.id,
                                e.target.value as ProcessMode,
                              )
                            }
                            disabled={processing}
                            inputProps={{
                              'aria-label': `${file.name}の処理方法`,
                            }}
                          >
                            <MenuItem value="text">テキスト表現</MenuItem>
                            <MenuItem value="image">画像</MenuItem>
                          </Select>
                        </FormControl>

                        {/* サブオプション（条件付き表示） */}
                        {file.processMode === 'image' && (
                          <Stack
                            direction="row"
                            spacing={0.5}
                            alignItems="center"
                          >
                            <FormControl size="small" sx={{ minWidth: 130 }}>
                              <Select
                                value={file.imageMode}
                                onChange={(e) =>
                                  handleImageModeChange(
                                    file.id,
                                    e.target.value as ImageMode,
                                  )
                                }
                                disabled={processing}
                                inputProps={{
                                  'aria-label': `${file.name}の画像化方式`,
                                }}
                              >
                                <MenuItem value="pages">ページごと</MenuItem>
                                <MenuItem value="merged">統合</MenuItem>
                              </Select>
                            </FormControl>
                            <Tooltip title="「統合」: 全ページを1つの縦長画像として統合します。AIモデルは画像を一定の大きさに圧縮して読み込むので、ページ数が多い場合は利用しないでください。「ページごと」: 各ページを個別の画像として処理します。office文書の場合はPDFに変換してから画像化します。">
                              <InfoOutlinedIcon
                                fontSize="small"
                                sx={{
                                  color: 'text.secondary',
                                  cursor: 'help',
                                }}
                                data-testid="file-image-mode-info"
                              />
                            </Tooltip>
                          </Stack>
                        )}

                        {/* テキストモードかつ画像抽出対応ファイルの場合 */}
                        {file.processMode !== 'image' &&
                          supportsImageExtraction(file.name) && (
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={file.includeImages ?? false}
                                  onChange={(e) =>
                                    handleIncludeImagesChange(
                                      file.id,
                                      e.target.checked,
                                    )
                                  }
                                  disabled={processing}
                                />
                              }
                              label={
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Typography variant="body2">
                                    画像を含める
                                  </Typography>
                                  <Tooltip title="ファイル内に挿入された画像もテキスト表現に含めるかどうか選択できます。画像が多いファイルではコンテキスト消費量が増え、精度の低下や文書一括レビューの失敗につながる場合があります。">
                                    <InfoOutlinedIcon
                                      fontSize="small"
                                      sx={{
                                        ml: 0.5,
                                        color: 'text.secondary',
                                        cursor: 'help',
                                      }}
                                    />
                                  </Tooltip>
                                </Box>
                              }
                              sx={{ ml: 0 }}
                            />
                          )}
                      </Stack>
                    ) : documentType !== 'checklist-csv' ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mr: 2 }}
                      >
                        テキスト抽出
                      </Typography>
                    ) : null}
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={handleClose}
              disabled={processing}
            >
              キャンセル
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={processing || disabled || uploadedFiles.length === 0}
              // startIcon={processing ? <CircularProgress size={20} /> : null}
            >
              {processing ? '処理中...' : getButtonText(modalMode)}
            </Button>
          </Box>
        </Box>

        {/* 変換進捗表示用Backdrop */}
        <Backdrop
          open={!!conversionProgress}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (theme) => theme.zIndex.modal + 1,
            color: '#fff',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
          }}
        >
          <Box
            sx={{
              textAlign: 'center',
              p: 4,
              bgcolor: 'background.paper',
              borderRadius: 2,
              minWidth: 300,
              maxWidth: 500,
            }}
          >
            <CircularProgress size={60} sx={{ mb: 3 }} />
            <Typography variant="h6" gutterBottom color="text.primary">
              ファイルを変換しています
            </Typography>
            {conversionProgress && (
              <>
                <Typography variant="body1" color="text.primary" sx={{ mb: 1 }}>
                  {conversionProgress.currentFileName}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  {conversionProgress.conversionType === 'pdf' ? (
                    <>
                      {conversionProgress.progressDetail?.type ===
                        'sheet-setup' &&
                      conversionProgress.progressDetail.sheetName ? (
                        <>
                          「{conversionProgress.progressDetail.sheetName}」
                          シートPDF印刷設定中
                          {conversionProgress.progressDetail.currentSheet &&
                          conversionProgress.progressDetail.totalSheets ? (
                            <>
                              {' '}
                              ({conversionProgress.progressDetail.currentSheet}/
                              {conversionProgress.progressDetail.totalSheets})
                            </>
                          ) : null}
                        </>
                      ) : conversionProgress.progressDetail?.type ===
                        'pdf-export' ? (
                        <>PDFファイルへエクスポート中</>
                      ) : (
                        <>PDFに変換中...</>
                      )}
                      <br />
                      ※<br />
                      変換に時間がかかる場合があります
                      <br />
                      変換されたPDFファイルはファイルパス、最終更新時刻をキーにキャッシュされます
                    </>
                  ) : (
                    '画像に変換中...'
                  )}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  処理済み: {conversionProgress.currentIndex} /{' '}
                  {conversionProgress.totalCount} ファイル
                </Typography>
              </>
            )}
          </Box>
        </Backdrop>
      </>
    </Modal>
  );
}

export default React.memo(ReviewSourceModal);
