import React, { useState, useEffect, useCallback } from 'react';
import { Box, Menu, MenuItem, Divider } from '@mui/material';
import SourceListModal from '../common/SourceListModal';
import { ChatRoom } from '../../types/schema';
import { chatService } from '../../services/chatService';
import { formatError } from '../../../utils/errors';
import SidebarHeader from './SidebarHeader';
import ChatRoomList from './ChatRoomList';
import SidebarFooter from './SidebarFooter';

interface SidebarProps {
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
  onCreateRoom: () => void;
  onSettingsClick: () => void;
  onReloadSources: () => void;
}

function Sidebar({
  selectedRoomId,
  onRoomSelect,
  onCreateRoom,
  onSettingsClick,
  onReloadSources,
}: SidebarProps) {
  const [isSourceListOpen, setIsSourceListOpen] = useState(false);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // チャットルーム一覧を取得
  const fetchChatRooms = useCallback(async () => {
    setLoading(true);
    try {
      const rooms = await chatService.getChatRooms();
      setChatRooms(rooms);
    } catch (error) {
      console.error(formatError(error));
    } finally {
      setLoading(false);
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
      console.error(formatError(error));
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
    const interval = setInterval(refreshChatRooms, 1000);
    return () => clearInterval(interval);
  }, [refreshChatRooms]);

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
      <SidebarHeader onCreateRoom={onCreateRoom} />
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
        <ChatRoomList
          rooms={chatRooms}
          selectedRoomId={selectedRoomId}
          loading={loading}
          onRoomSelect={onRoomSelect}
          onMenuOpen={handleMenuOpen}
        />
      </Box>

      <SidebarFooter
        onSettingsClick={onSettingsClick}
        onReloadSources={() => setIsSourceListOpen(true)}
      />

      {/* ソース一覧モーダル */}
      <SourceListModal
        open={isSourceListOpen}
        onClose={() => setIsSourceListOpen(false)}
        onReloadSources={onReloadSources}
      />

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
}

export default React.memo(Sidebar);
