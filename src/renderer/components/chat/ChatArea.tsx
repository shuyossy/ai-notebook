import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Divider } from '@mui/material';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { ChatMessage, ChatRoom } from '../../types';
import { chatService } from '../../services/chatService';

interface ChatAreaProps {
  selectedRoomId: string | null;
}

function ChatArea({ selectedRoomId }: ChatAreaProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const streamingMessageRef = useRef<string>(streamingMessage);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null);

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

  // チャットルームのストリーミングメッセージを更新するためのコールバック関数を登録
  useEffect(() => {
    // 現在のチャットルーム情報をリフレッシュ
    const refreshCurrentRoomInfo = async () => {
      if (!selectedRoomId) return;

      try {
        const rooms = await chatService.getChatRooms();
        const room = rooms.find((r) => r.id === selectedRoomId);
        if (room) {
          setCurrentRoom(room);
        }
      } catch (error) {
        console.error('チャットルーム情報の更新に失敗しました:', error);
      }
    };

    const unsubscribeCallback = chatService.streamResponse({
      onMessage: (chunk) => {
        setStreamingMessage((prev) => prev + chunk);
        streamingMessageRef.current += chunk;
      },
      onDone: () => {
        // 完了したらメッセージリストに追加
        setStreamingMessage('');
        setMessages((prev) => [
          ...prev,
          {
            id: '',
            roomId: selectedRoomId || '',
            role: 'assistant',
            content: streamingMessageRef.current,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]);

        // チャットルーム一覧の情報が更新されている可能性があるので、現在のルーム情報も取得
        refreshCurrentRoomInfo();
        setSending(false);
      },
      onError: (error) => {
        console.error('AI応答の取得に失敗しました:', error);
        setStreamingMessage('');
        setSending(false);
      },
    });
    return () => {
      setStreamingMessage('');
      setSending(false);
      unsubscribeCallback();
    };
    // eslint-disable-next-line
  }, [selectedRoomId]);

  // チャットルームが選択されたらそのメッセージを取得
  useEffect(() => {
    if (selectedRoomId) {
      fetchMessages(selectedRoomId);
    } else {
      setMessages([]);
      setCurrentRoom(null);
    }
  }, [selectedRoomId]);

  // メッセージを送信
  const handleSendMessage = (content: string) => {
    if (!selectedRoomId) return;

    setSending(true);
    setStreamingMessage('');
    try {
      // ユーザーメッセージを送信
      const userMessage = chatService.sendMessage(selectedRoomId, content);
      setMessages((prev) => [...prev, userMessage]);
    } catch (error) {
      console.error('メッセージの送信に失敗しました:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      sx={{
        width: 'calc(100% - 280px)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
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
}

export default ChatArea;
