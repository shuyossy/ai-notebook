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
import { v4 as uuid } from 'uuid';
import { ReviewAreaProps, ModalMode, DocumentType } from './types';
import ReviewChecklistSection from './ReviewChecklistSection';
import ReviewSourceModal from './ReviewSourceModal';
import {
  ReviewChecklistEdit,
  ReviewChecklistResult,
} from '../../../main/types';
import AlertManager, { AlertMessage } from '../common/AlertMessage';
import { reviewService } from '../../services/reviewService';

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
  const [additionalAlerts, setAdditionalAlerts] = useState<AlertMessage[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);

  // メッセージアラートが閉じられる際の挙動
  const closeAdditionalAlerts = (id: string) => {
    setAdditionalAlerts((prev) => prev.filter((alert) => alert.id !== id));
  };

  // チェックリスト取得
  const fetchChecklistResults = useCallback(async () => {
    if (!selectedReviewHistoryId) return;

    try {
      const result = await reviewService.getReviewHistoryDetail(
        selectedReviewHistoryId,
      );
      setChecklistResults(result.checklists || []);
    } catch (error) {
      setAdditionalAlerts((prev) => [
        ...prev,
        {
          id: uuid(),
          type: 'error',
          content: `チェックリストの取得中にエラーが発生しました: ${(error as Error).message}`,
        },
      ]);
    }
  }, [selectedReviewHistoryId]);

  // 選択中の履歴が変更されたら、チェックリスト取得のポーリングを開始
  useEffect(() => {
    if (!selectedReviewHistoryId) return;

    // チェックリストの初期取得
    fetchChecklistResults();

    // ポーリングの開始
    const timer = setInterval(fetchChecklistResults, 5000);

    // eslint-disable-next-line
    return () => {
      clearInterval(timer);
    };
  }, [selectedReviewHistoryId, fetchChecklistResults]);

  // チェックリストの抽出処理
  const handleExtractChecklist = useCallback(
    async (
      sourceIds: number[],
      documentType?: DocumentType,
      checklistRequirements?: string,
    ) => {
      if (!selectedReviewHistoryId) return;

      try {
        setIsExtracting(true);
        setIsModalOpen(false);

        // チェックリスト抽出処理を開始
        const result = await window.electron.review.extractChecklist({
          reviewHistoryId: selectedReviewHistoryId,
          sourceIds,
          documentType,
          checklistRequirements,
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        // 抽出完了イベントの購読を開始
        const unsubscribe = reviewService.subscribeChecklistExtractionFinished(
          (payload) => {
            if (payload.success) {
              setAdditionalAlerts((prev) => [
                ...prev,
                {
                  id: uuid(),
                  type: 'success',
                  content: 'チェックリストの抽出が完了しました',
                },
              ]);
            } else {
              setAdditionalAlerts((prev) => [
                ...prev,
                {
                  id: uuid(),
                  type: 'error',
                  content: `チェックリストの抽出に失敗しました: ${payload.error}`,
                },
              ]);
            }
            setIsExtracting(false);
            unsubscribe();
          },
        );
      } catch (error) {
        setAdditionalAlerts((prev) => [
          ...prev,
          {
            id: uuid(),
            type: 'error',
            content: `チェックリストの抽出処理実行時にエラーが発生しました: ${(error as Error).message}`,
          },
        ]);
        setIsExtracting(false);
      }
    },
    [selectedReviewHistoryId],
  );

  // レビュー実行処理
  const handleExecuteReview = useCallback(
    async (sourceIds: number[]) => {
      if (!selectedReviewHistoryId) return;

      try {
        setIsReviewing(true);
        setIsModalOpen(false);

        // レビュー実行処理を開始
        const result = await window.electron.review.execute({
          reviewHistoryId: selectedReviewHistoryId,
          sourceIds,
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        // レビュー完了イベントの購読を開始
        const unsubscribe = reviewService.subscribeReviewExecutionFinished(
          (payload) => {
            if (payload.success) {
              setAdditionalAlerts((prev) => [
                ...prev,
                {
                  id: uuid(),
                  type: 'success',
                  content: 'レビューが完了しました',
                },
              ]);
            } else {
              setAdditionalAlerts((prev) => [
                ...prev,
                {
                  id: uuid(),
                  type: 'error',
                  content: `レビューに失敗しました: ${payload.error}`,
                },
              ]);
            }
            setIsReviewing(false);
            unsubscribe();
          },
        );
      } catch (error) {
        setAdditionalAlerts((prev) => [
          ...prev,
          {
            id: uuid(),
            type: 'error',
            content: `レビュー処理実行時にエラーが発生しました: ${(error as Error).message}`,
          },
        ]);
        setIsReviewing(false);
      }
    },
    [selectedReviewHistoryId],
  );

  const handleModalSubmit = useCallback(
    async (
      sourceIds: number[],
      documentType?: DocumentType,
      checklistRequirements?: string,
    ) => {
      if (modalMode === 'extract') {
        await handleExtractChecklist(
          sourceIds,
          documentType,
          checklistRequirements,
        );
      } else if (modalMode === 'review') {
        await handleExecuteReview(sourceIds);
      }
    },
    [modalMode, handleExtractChecklist, handleExecuteReview],
  );

  // チェックリストの更新処理
  const handleSaveChecklist = async (checklists: ReviewChecklistEdit[]) => {
    if (!selectedReviewHistoryId) return;

    try {
      setIsSaving(true);
      const result = await window.electron.review.updateChecklist({
        reviewHistoryId: selectedReviewHistoryId,
        checklistEdits: checklists,
      });

      if (result.success) {
        setAdditionalAlerts((prev) => [
          ...prev,
          {
            id: uuid(),
            type: 'success',
            content: 'チェックリストが更新されました',
          },
        ]);
        await fetchChecklistResults();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setAdditionalAlerts((prev) => [
        ...prev,
        {
          id: uuid(),
          type: 'error',
          content: `チェックリストの更新中にエラーが発生しました: ${(error as Error).message}`,
        },
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box
      sx={{
        width: 'calc(100% - 280px)',
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
      {/* アラートメッセージ */}
      <AlertManager
        additionalAlerts={additionalAlerts}
        closeAdditionalAlerts={closeAdditionalAlerts}
      />
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
                startIcon={
                  !isExtracting ? (
                    <CheckBoxIcon />
                  ) : (
                    <CircularProgress size={24} color="inherit" />
                  )
                }
                onClick={() => {
                  setModalMode('extract');
                  setIsModalOpen(true);
                }}
                disabled={
                  !selectedReviewHistoryId || isExtracting || isReviewing
                }
              >
                チェックリスト抽出
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={
                  !isReviewing ? (
                    <RateReviewIcon />
                  ) : (
                    <CircularProgress size={24} color="inherit" />
                  )
                }
                onClick={() => {
                  setModalMode('review');
                  setIsModalOpen(true);
                }}
                disabled={
                  !selectedReviewHistoryId ||
                  isExtracting ||
                  isReviewing ||
                  checklistResults.length === 0
                }
              >
                レビュー実行
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
