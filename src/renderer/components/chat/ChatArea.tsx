import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Divider } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { ChatMessage } from '../../../main/types';
import { chatService } from '../../services/chatService';

interface ChatAreaProps {
  selectedRoomId: string | null;
  sending: boolean;
  setSending: (sending: boolean) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  selectedRoomId,
  sending,
  setSending,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const streamingMessageRef = useRef<string>(streamingMessage);
  // メッセージを取得
  const fetchMessages = async (roomId: string) => {
    setLoading(true);
    try {
      const chatMessages = await chatService.getChatMessages(roomId);
      setMessages(chatMessages);
    } catch (error) {
      console.error('チャットメッセージの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  };

  // streamingMessageが変わるたびにRefを更新
  useEffect(() => {
    streamingMessageRef.current = streamingMessage;
  }, [streamingMessage]);

  // チャットルームのストリーミングメッセージを更新するためのコールバック関数を登録
  useEffect(() => {
    const unsubscribeCallback = chatService.streamResponse({
      onMessage: (chunk) => {
        setStreamingMessage((prev) => prev + chunk);
      },
      onDone: () => {
        // 完了したらメッセージリストに追加
        setStreamingMessage('');
        setMessages((prev) => [
          ...prev,
          {
            id: uuidv4(),
            role: 'assistant',
            content: streamingMessageRef.current,
            createdAt: new Date(),
          },
        ]);

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
      setSending(false); // エラー時のみ送信状態を解除
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
