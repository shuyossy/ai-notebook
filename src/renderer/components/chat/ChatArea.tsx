import React, { useState, useEffect } from 'react';
import { Box, Typography, Divider } from '@mui/material';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { ChatMessage, ChatRoom } from '../../types';
import chatService from '../../services/chatService';

interface ChatAreaProps {
  selectedRoomId: string | null;
}

const ChatArea: React.FC<ChatAreaProps> = ({ selectedRoomId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null);

  // チャットルームが選択されたらそのメッセージを取得
  useEffect(() => {
    if (selectedRoomId) {
      fetchMessages(selectedRoomId);
    } else {
      setMessages([]);
      setCurrentRoom(null);
    }
  }, [selectedRoomId]);

  // メッセージを取得
  const fetchMessages = async (roomId: string) => {
    setLoading(true);
    try {
      const chatMessages = await chatService.getChatMessages(roomId);
      setMessages(chatMessages);

      // チャットルーム情報も取得（実際の実装では合わせて取得するように最適化）
      const rooms = await chatService.getChatRooms();
      const room = rooms.find((r) => r.id === roomId);
      if (room) {
        setCurrentRoom(room);
      }
    } catch (error) {
      console.error('チャットメッセージの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  };

  // メッセージを送信
  const handleSendMessage = async (content: string) => {
    if (!selectedRoomId) return;

    setSending(true);
    try {
      // ユーザーメッセージを送信
      const userMessage = await chatService.sendMessage(
        selectedRoomId,
        content,
      );
      setMessages((prev) => [...prev, userMessage]);

      // AIの応答をストリーミングで取得
      setStreamingMessage('');
      await chatService.streamResponse(selectedRoomId, userMessage.id, {
        onMessage: (chunk) => {
          setStreamingMessage(chunk);
        },
        onDone: (message) => {
          // 完了したらメッセージリストに追加
          setStreamingMessage(null);
          setMessages((prev) => [...prev, message]);
        },
        onError: (error) => {
          console.error('AI応答の取得に失敗しました:', error);
          setStreamingMessage(null);
        },
      });
    } catch (error) {
      console.error('メッセージの送信に失敗しました:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      sx={{
        flexGrow: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {selectedRoomId ? (
        <>
          {/* ヘッダー */}
          <Box
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="h6">
              {currentRoom?.title || 'チャット'}
            </Typography>
          </Box>

          <Divider />

          {/* メッセージリスト */}
          <MessageList
            messages={messages}
            loading={loading}
            streamingMessage={streamingMessage}
          />

          <Divider />

          {/* メッセージ入力 */}
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={loading}
            sending={sending}
          />
        </>
      ) : (
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="h6" color="text.secondary">
            チャットルームを選択してください
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ChatArea;
