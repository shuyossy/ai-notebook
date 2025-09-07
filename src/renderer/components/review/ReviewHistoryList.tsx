import React, { useState, useEffect, useCallback } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Box,
  Tooltip,
  Menu,
  MenuItem,
  CircularProgress,
  Divider,
  Button,
} from '@mui/material';
import { MoreVert as MoreIcon } from '@mui/icons-material';
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import { v4 as uuidv4 } from 'uuid';
import type { ReviewHistory } from '../../../db/schema';
import { ReviewApi } from '../../service/reviewApi';

interface ReviewHistoryListProps {
  selectedReviewHistoryId?: string | null;
  onReviewHistorySelect: (roomId: string | null) => void;
}

function ReviewHistoryList({
  selectedReviewHistoryId = null,
  onReviewHistorySelect,
}: ReviewHistoryListProps) {
  const [reviewHistories, setReviewHistories] = useState<ReviewHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  // メニュー選択中のレビュー履歴ID
  const [activeReviewId, setActiveHistoryId] = useState<string | null>(null);

  // レビュー履歴一覧を取得
  const fetchReviewHistories = useCallback(async () => {
    try {
      const reviewApi = ReviewApi.getInstance();
      const histories = await reviewApi.getHistories({
        showAlert: false,
        throwError: true,
        printErrorLog: false,
      });
      if (histories && histories.length > 0) {
        // updatedAtで降順ソート
        const sortedHistories = [...histories].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setReviewHistories(sortedHistories);
      }
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(true);
    }
  }, []);

  // 初期データ読み込み
  useEffect(() => {
    fetchReviewHistories();
  }, [fetchReviewHistories]);

  // メニュー操作
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    roomId: string,
  ) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setActiveHistoryId(roomId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setActiveHistoryId(null);
  };

  // レビュー履歴削除
  const handleDeleteRoom = async () => {
    if (!activeReviewId) return;

    try {
      const reviewApi = ReviewApi.getInstance();
      await reviewApi.deleteHistory(activeReviewId, {
        showAlert: true,
        throwError: true,
        printErrorLog: false,
      });
      // 削除した履歴が選択中だった場合は選択を解除
      if (selectedReviewHistoryId === activeReviewId) {
        onReviewHistorySelect(null);
      }

      // 一覧を再取得して最新状態を反映
      fetchReviewHistories();
    } catch (error) {
      console.error(error);
    } finally {
      handleMenuClose();
    }
  };

  // レビュー履歴の更新をトリガーする関数
  const refreshReviewHistories = useCallback(() => {
    fetchReviewHistories();
  }, [fetchReviewHistories]);

  // レビュー履歴の定期更新
  useEffect(() => {
    const interval = setInterval(refreshReviewHistories, 5000);
    return () => clearInterval(interval);
  }, [refreshReviewHistories]);

  // 新しいレビューを開始
  const handleCreateReview = () => {
    // 新しいUUIDを生成してルームIDとして使用
    const newReviewId = uuidv4();
    // 選択状態を更新
    onReviewHistorySelect(newReviewId);
    // モーダルは表示せず、すぐにレビュー画面に遷移
  };

  const renderContent = () => {
    // ローディング中は「レビュー履歴取得中」とスピナーを表示
    if (loading) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CircularProgress size={24} sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            ドキュメントレビュー履歴取得中
          </Typography>
        </Box>
      );
    }

    // レビュー履歴がない場合は「レビュー履歴がありません」と表示
    if (reviewHistories.length === 0) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            ドキュメントレビュー履歴がありません
          </Typography>
        </Box>
      );
    }

    return (
      <>
        <List disablePadding>
          {reviewHistories.map((reviewHistory) => (
            <ListItem
              key={reviewHistory.id}
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="more"
                  onClick={(e) => handleMenuOpen(e, reviewHistory.id)}
                >
                  <MoreIcon />
                </IconButton>
              }
            >
              <ListItemButton
                selected={selectedReviewHistoryId === reviewHistory.id}
                onClick={() => onReviewHistorySelect(reviewHistory.id)}
                sx={{ pr: 6 }}
              >
                <Tooltip title={reviewHistory.title} placement="right">
                  <ListItemText
                    primary={reviewHistory.title}
                    primaryTypographyProps={{
                      noWrap: true,
                      sx: {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    }}
                  />
                </Tooltip>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        {/* チャットルームメニュー */}
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleDeleteRoom}>削除</MenuItem>
        </Menu>
      </>
    );
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Box
        sx={{ py: 1, px: 2, pt: 0, display: 'flex', justifyContent: 'start' }}
      >
        <Button
          startIcon={<AddCircleOutlineOutlinedIcon />}
          onClick={handleCreateReview}
          sx={{ pl: 0.3, fontSize: '1rem' }}
          disabled={loading}
          // fullWidth
        >
          新規レビュー
        </Button>
      </Box>
      <Divider />
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
        }}
        className="hidden-scrollbar"
      >
        {renderContent()}
      </Box>
    </Box>
  );
}

export default React.memo(ReviewHistoryList);
