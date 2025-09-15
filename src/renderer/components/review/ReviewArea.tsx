import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Paper,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import RateReviewIcon from '@mui/icons-material/RateReview';
import StopIcon from '@mui/icons-material/Stop';
import {
  ReviewChecklistEdit,
  ReviewChecklistResult,
  ModalMode,
  DocumentType,
  UploadFile,
} from '@/types';
import { ReviewAreaProps } from './types';
import ReviewChecklistSection from './ReviewChecklistSection';
import ReviewSourceModal from './ReviewSourceModal';
import { ReviewApi } from '../../service/reviewApi';
import { useAlertStore } from '../../stores/alertStore';
import { getSafeErrorMessage } from '../../lib/error';

const defaultCommentFormat =
  '【評価理由・根拠】\n（具体的な理由と根拠を記載）\n\n【改善提案】\n（改善のための具体的な提案を記載）';

const ReviewArea: React.FC<ReviewAreaProps> = ({ selectedReviewHistoryId }) => {
  // 状態管理
  const [checklistResults, setChecklistResults] = useState<
    ReviewChecklistResult[]
  >([]);
  // チェックリスト更新処理中であるかどうか
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [commentFormat, setCommentFormat] = useState(defaultCommentFormat);

  const addAlert = useAlertStore((state) => state.addAlert);

  // チェック履歴取得
  const fetchChecklistResults = useCallback(async () => {
    if (!selectedReviewHistoryId) return;
    const reviewApi = ReviewApi.getInstance();

    const result = await reviewApi.getReviewHistoryDetail(
      selectedReviewHistoryId,
      { throwError: true, showAlert: true },
    );
    setChecklistResults(result?.checklistResults || []);
  }, [selectedReviewHistoryId]);

  // 選択中の履歴が変更されたら、初期データ取得を実行
  useEffect(() => {
    if (!selectedReviewHistoryId) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    // 初期データ取得（エラーが発生しなくなるまでポーリング）
    const loadInitialData = async () => {
      try {
        // チェックリストの初期取得
        await fetchChecklistResults();

        // 追加指示とコメントフォーマットの取得
        const reviewApi = ReviewApi.getInstance();
        const result = await reviewApi.getReviewInstruction(
          selectedReviewHistoryId,
          {
            throwError: true,
            showAlert: true,
          },
        );
        setAdditionalInstructions(result?.additionalInstructions || '');
        setCommentFormat(result?.commentFormat || defaultCommentFormat);

        // 初期データ取得成功したらポーリングを停止
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        console.error('初期データの取得に失敗しました:', error);
        // 失敗時はポーリングを継続（既に設定済みの場合は何もしない）
        if (!intervalId) {
          intervalId = setInterval(loadInitialData, 5000);
        }
      }
    };

    // 初回実行
    loadInitialData();

    // クリーンアップでポーリング停止
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [selectedReviewHistoryId, fetchChecklistResults]);

  // 処理中のポーリング制御
  useEffect(() => {
    if (!selectedReviewHistoryId || (!isExtracting && !isReviewing)) return;

    // チェックリスト抽出処理中またはレビュー実行処理中のみポーリング開始
    const processingTimer = setInterval(async () => {
      try {
        await fetchChecklistResults();
      } catch (error) {
        console.error('チェックリスト結果の取得に失敗しました:', error);
      }
    }, 5000);

    return () => {
      clearInterval(processingTimer);
    };
  }, [
    selectedReviewHistoryId,
    isExtracting,
    isReviewing,
    fetchChecklistResults,
  ]);

  // チェックリストの抽出処理
  const handleExtractChecklist = useCallback(
    async (
      files: UploadFile[],
      documentType?: DocumentType,
      checklistRequirements?: string,
    ) => {
      if (!selectedReviewHistoryId) return;

      const reviewApi = ReviewApi.getInstance();

      try {
        setIsExtracting(true);
        setIsModalOpen(false);

        // チェックリスト抽出処理を開始
        await reviewApi.extractChecklist(
          selectedReviewHistoryId,
          files,
          documentType,
          checklistRequirements,
          { throwError: true, showAlert: false },
        );

        // 抽出完了イベントの購読を開始
        const unsubscribe = reviewApi.subscribeChecklistExtractionFinished(
          (payload) => {
            // 抽出結果の再取得
            fetchChecklistResults().catch((error) => {
              addAlert({
                message: getSafeErrorMessage(
                  error,
                  'チェックリストの取得に失敗しました',
                ),
                severity: 'error',
              });
            });
            if (payload.status === 'success') {
              addAlert({
                message: 'チェックリストの抽出が完了しました',
                severity: 'success',
              });
            } else if (payload.status === 'failed') {
              addAlert({
                message: `チェックリストの抽出に失敗しました\n${payload.error}`,
                severity: 'error',
              });
            }
            setIsExtracting(false);
            unsubscribe();
          },
        );
      } catch (error) {
        console.error(error);
        addAlert({
          message: getSafeErrorMessage(
            error,
            'チェックリスト抽出の実行に失敗しました',
          ),
          severity: 'error',
        });
        setIsExtracting(false);
      }
    },
    [selectedReviewHistoryId, addAlert, fetchChecklistResults],
  );

  // レビュー実行処理
  const handleExecuteReview = useCallback(
    async (files: UploadFile[]) => {
      if (!selectedReviewHistoryId) return;

      const reviewApi = ReviewApi.getInstance();

      try {
        setIsReviewing(true);
        setIsModalOpen(false);

        // レビュー実行処理を開始
        const result = await reviewApi.executeReview(
          selectedReviewHistoryId,
          files,
          additionalInstructions || additionalInstructions,
          commentFormat || commentFormat,
          { throwError: true, showAlert: false },
        );

        // レビュー完了イベントの購読を開始
        const unsubscribe = reviewApi.subscribeReviewExtractionFinished(
          (payload) => {
            // 抽出結果の再取得
            fetchChecklistResults().catch((error) => {
              addAlert({
                message: getSafeErrorMessage(
                  error,
                  'チェックリストの取得に失敗しました',
                ),
                severity: 'error',
              });
            });
            if (payload.status === 'success') {
              addAlert({
                message: 'レビューが完了しました',
                severity: 'success',
              });
            } else if (payload.status === 'failed') {
              addAlert({
                message: `レビューに失敗しました\n${payload.error}`,
                severity: 'error',
              });
            }
            setIsReviewing(false);
            unsubscribe();
          },
        );
      } catch (error) {
        console.error(error);
        addAlert({
          message: getSafeErrorMessage(error, 'レビューの実行に失敗しました'),
          severity: 'error',
        });
        setIsReviewing(false);
      }
    },
    [
      selectedReviewHistoryId,
      addAlert,
      additionalInstructions,
      commentFormat,
      fetchChecklistResults,
    ],
  );

  // チェックリスト抽出のキャンセル処理
  const handleCancelExtractChecklist = useCallback(async () => {
    if (!selectedReviewHistoryId) return;

    const reviewApi = ReviewApi.getInstance();

    try {
      await reviewApi.abortExtractChecklist(selectedReviewHistoryId, {
        showAlert: false,
        throwError: true,
      });
      setIsExtracting(false);
      addAlert({
        message: 'チェックリスト抽出をキャンセルしました',
        severity: 'info',
      });
      // 抽出結果の再取得
      fetchChecklistResults().catch((error) => {
        addAlert({
          message: getSafeErrorMessage(
            error,
            'チェックリストの取得に失敗しました',
          ),
          severity: 'error',
        });
      });
    } catch (error) {
      console.error('チェックリスト抽出のキャンセルエラー:', error);
      addAlert({
        message: 'チェックリスト抽出のキャンセルに失敗しました',
        severity: 'warning',
      });
    }
  }, [selectedReviewHistoryId, addAlert, fetchChecklistResults]);

  // レビュー実行のキャンセル処理
  const handleCancelExecuteReview = useCallback(async () => {
    if (!selectedReviewHistoryId) return;

    const reviewApi = ReviewApi.getInstance();

    try {
      await reviewApi.abortExecuteReview(selectedReviewHistoryId, {
        showAlert: true,
        throwError: true,
      });
      setIsReviewing(false);
      addAlert({
        message: 'レビュー実行をキャンセルしました',
        severity: 'info',
      });
      fetchChecklistResults().catch((error) => {
        addAlert({
          message: getSafeErrorMessage(
            error,
            'チェックリストの取得に失敗しました',
          ),
          severity: 'error',
        });
      });
    } catch (error) {
      console.error('レビュー実行のキャンセルエラー:', error);
      addAlert({
        message: 'レビュー実行のキャンセルに失敗しました',
        severity: 'warning',
      });
    }
  }, [selectedReviewHistoryId, addAlert, fetchChecklistResults]);

  const handleModalSubmit = useCallback(
    async (
      files: UploadFile[],
      documentType?: DocumentType,
      checklistRequirements?: string,
    ) => {
      if (modalMode === 'extract') {
        await handleExtractChecklist(
          files,
          documentType,
          checklistRequirements,
        );
      } else if (modalMode === 'review') {
        await handleExecuteReview(files);
      }
    },
    [modalMode, handleExtractChecklist, handleExecuteReview],
  );

  // チェックリストの更新処理
  const handleSaveChecklist = async (checklists: ReviewChecklistEdit[]) => {
    if (!selectedReviewHistoryId) return;

    setIsSaving(true);
    const reviewApi = ReviewApi.getInstance();
    try {
      await reviewApi.updateChecklist(selectedReviewHistoryId, checklists, {
        throwError: false,
        showAlert: true,
      });
      // 更新後は最新状態を再取得
      await fetchChecklistResults();
      addAlert({
        message: 'チェックリストを更新しました',
        severity: 'info',
      });
    } catch (error) {
      console.error('チェックリストの保存に失敗しました:', error);
      addAlert({
        message: getSafeErrorMessage(
          error,
          'チェックリストの保存に失敗しました',
        ),
        severity: 'error',
      });
    }
    setIsSaving(false);
  };

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        p: 3,
        position: 'relative',
        right: 0,
        top: 0,
        bottom: 0,
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {selectedReviewHistoryId && (
        <>
          {/* ヘッダー部分 */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={3}
          >
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                color={isExtracting ? 'error' : 'primary'}
                startIcon={isExtracting ? <StopIcon /> : <CheckBoxIcon />}
                onClick={
                  isExtracting
                    ? handleCancelExtractChecklist
                    : () => {
                        setModalMode('extract');
                        setIsModalOpen(true);
                      }
                }
                disabled={!selectedReviewHistoryId || isReviewing}
              >
                {isExtracting ? 'キャンセル' : 'チェックリスト抽出'}
              </Button>
              <Button
                variant="contained"
                color={isReviewing ? 'error' : 'primary'}
                startIcon={isReviewing ? <StopIcon /> : <RateReviewIcon />}
                onClick={
                  isReviewing
                    ? handleCancelExecuteReview
                    : () => {
                        setModalMode('review');
                        setIsModalOpen(true);
                      }
                }
                disabled={
                  !selectedReviewHistoryId ||
                  isExtracting ||
                  (checklistResults.length === 0 && !isReviewing)
                }
              >
                {isReviewing ? 'キャンセル' : 'レビュー実行'}
              </Button>
            </Stack>
          </Stack>

          {/* メインコンテンツ */}
          <Paper
            sx={{
              p: 2,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <ReviewChecklistSection
              checklistResults={checklistResults}
              isLoading={isExtracting || isReviewing}
              onSave={handleSaveChecklist}
            />
          </Paper>

          {/* モーダル */}
          <ReviewSourceModal
            open={isModalOpen}
            onClose={() => {
              setModalMode(null);
              setIsModalOpen(false);
            }}
            onSubmit={handleModalSubmit}
            selectedReviewHistoryId={selectedReviewHistoryId || null}
            disabled={isSaving || isExtracting || isReviewing}
            modalMode={modalMode!}
            additionalInstructions={additionalInstructions}
            setAdditionalInstructions={setAdditionalInstructions}
            commentFormat={commentFormat}
            setCommentFormat={setCommentFormat}
          />
        </>
      )}
      {/* チェックリストが選択されていない場合のメッセージ */}
      {!selectedReviewHistoryId && (
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Typography variant="h6" color="text.secondary">
            新規レビューを開始または既存のレビュー履歴を選択してください
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ReviewArea;
