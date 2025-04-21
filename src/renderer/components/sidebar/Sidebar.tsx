import React, { useState, useEffect } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Typography,
  Button,
  CircularProgress,
  Tooltip,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  ChatBubbleOutline as ChatIcon,
  MoreVert as MoreIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { ChatRoom } from '../../types';
import chatService from '../../services/chatService';
import sourceService from '../../services/sourceService';

interface SidebarProps {
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
  onCreateRoom: () => void;
  onSettingsClick: () => void;
  onReloadSources: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  selectedRoomId,
  onRoomSelect,
  onCreateRoom,
  onSettingsClick,
  onReloadSources,
}) => {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // チャットルーム一覧を取得
  const fetchChatRooms = async () => {
    setLoading(true);
    try {
      const rooms = await chatService.getChatRooms();
      setChatRooms(rooms);
    } catch (error) {
      console.error('チャットルームの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初期データ読み込み
  useEffect(() => {
    fetchChatRooms();
  }, []);

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
      // 一覧を更新
      setChatRooms(chatRooms.filter((room) => room.id !== activeRoomId));
      // 削除したルームが選択中だった場合は選択を解除
      if (selectedRoomId === activeRoomId) {
        onRoomSelect('');
      }
    } catch (error) {
      console.error('チャットルームの削除に失敗しました:', error);
    } finally {
      handleMenuClose();
    }
  };

  return (
    <Box
      sx={{
        width: 280,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      {/* ヘッダー */}
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          MyPedia
        </Typography>
      </Box>

      {/* 新規チャットボタン */}
      <Box sx={{ px: 2, mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateRoom}
          fullWidth
        >
          新規チャット
        </Button>
      </Box>

      <Divider />

      {/* チャットルーム一覧 */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6,
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,.2)',
            borderRadius: 3,
          },
        }}
        className="hidden-scrollbar"
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : chatRooms.length > 0 ? (
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
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <ChatIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={room.title}
                    primaryTypographyProps={{
                      noWrap: true,
                      title: room.title,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ) : (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              チャットがありません
            </Typography>
          </Box>
        )}
      </Box>

      {/* フッターボタン */}
      <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Tooltip title="ソースを再読み込み">
            <IconButton onClick={onReloadSources}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="設定">
            <IconButton onClick={onSettingsClick}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* チャットルームメニュー */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleDeleteRoom}>削除</MenuItem>
      </Menu>
    </Box>
  );
};

export default Sidebar;
