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
import type { ChatRoom } from '../../../main/types';
import { chatService } from '../../service/chatService';

interface ChatRoomListProps {
  selectedRoomId?: string | null;
  onRoomSelect: (roomId: string) => void;
}

function ChatRoomList({
  selectedRoomId = null,
  onRoomSelect,
}: ChatRoomListProps) {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  // メニュー選択中のチャットルームID
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // チャットルーム一覧を取得
  const fetchChatRooms = useCallback(async () => {
    try {
      const rooms = await chatService.getChatRooms();
      // updatedAtで降順ソート
      const sortedRooms = [...rooms].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setChatRooms(sortedRooms);
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(true);
    }
  }, []);

  // 初期データ読み込み
  useEffect(() => {
    fetchChatRooms();
  }, [fetchChatRooms]);

  // メニュー操作
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    roomId: string,
  ) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setActiveRoomId(roomId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setActiveRoomId(null);
  };

  // チャットルーム削除
  const handleDeleteRoom = async () => {
    if (!activeRoomId) return;

    try {
      await chatService.deleteChatRoom(activeRoomId);
      // 削除したルームが選択中だった場合は選択を解除
      if (selectedRoomId === activeRoomId) {
        onRoomSelect('');
      }

      // 一覧を再取得して最新状態を反映
      fetchChatRooms();
    } catch (error) {
      console.error(error);
    } finally {
      handleMenuClose();
    }
  };

  // チャットルーム一覧の更新をトリガーする関数
  const refreshChatRooms = useCallback(() => {
    fetchChatRooms();
  }, [fetchChatRooms]);

  // チャットルーム一覧の定期更新
  useEffect(() => {
    const interval = setInterval(refreshChatRooms, 5000);
    return () => clearInterval(interval);
  }, [refreshChatRooms]);

  // 新しいチャットを開始
  const handleCreateRoom = () => {
    // 新しいUUIDを生成してルームIDとして使用
    const newRoomId = uuidv4();
    // 選択状態を更新
    onRoomSelect(newRoomId);
    // モーダルは表示せず、すぐにチャット画面に遷移
  };

  const renderContent = () => {
    // ローディング中は「チャット履歴取得中」とスピナーを表示
    if (loading) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CircularProgress size={24} sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            チャット履歴取得中
          </Typography>
        </Box>
      );
    }

    // チャットルームがない場合は「チャットルームがありません」と表示
    if (chatRooms.length === 0) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            チャット履歴がありません
          </Typography>
        </Box>
      );
    }

    return (
      <>
        <List disablePadding>
          {chatRooms.map((room) => (
            <ListItem
              key={room.id}
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="more"
                  onClick={(e) => handleMenuOpen(e, room.id)}
                >
                  <MoreIcon />
                </IconButton>
              }
            >
              <ListItemButton
                selected={selectedRoomId === room.id}
                onClick={() => onRoomSelect(room.id)}
                sx={{ pr: 6 }}
              >
                <Tooltip title={room.title} placement="right">
                  <ListItemText
                    primary={room.title}
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
          onClick={handleCreateRoom}
          sx={{ pl: 0.3, fontSize: '1rem' }}
          disabled={loading}
          // fullWidth
        >
          新規チャット
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

export default React.memo(ChatRoomList);
