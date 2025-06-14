import React from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Box,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { MoreVert as MoreIcon } from '@mui/icons-material';
import type { ChatRoom } from '../../../main/types';

interface ChatRoomListProps {
  rooms: ChatRoom[];
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>, roomId: string) => void;
  loading?: boolean;
}

function ChatRoomList({
  rooms,
  selectedRoomId,
  onRoomSelect,
  onMenuOpen,
  loading,
}: ChatRoomListProps) {
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
  if (rooms.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          チャット履歴がありません
        </Typography>
      </Box>
    );
  }

  return (
    <List disablePadding>
      {rooms.map((room) => (
        <ListItem
          key={room.id}
          disablePadding
          secondaryAction={
            <IconButton
              edge="end"
              aria-label="more"
              onClick={(e) => onMenuOpen(e, room.id)}
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
  );
}

export default React.memo(ChatRoomList);
