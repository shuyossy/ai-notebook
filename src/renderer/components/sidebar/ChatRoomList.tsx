import React from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import {
  ChatBubbleOutline as ChatIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import type { ChatRoom } from '../../types/schema';

interface ChatRoomListProps {
  rooms: ChatRoom[];
  selectedRoomId: string | null;
  loading: boolean;
  onRoomSelect: (roomId: string) => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>, roomId: string) => void;
}

function ChatRoomList({
  rooms,
  selectedRoomId,
  loading,
  onRoomSelect,
  onMenuOpen,
}: ChatRoomListProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (rooms.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          チャットがありません
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
  );
}

export default React.memo(ChatRoomList);
