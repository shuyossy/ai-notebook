import React, { useState, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { Box, Divider, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { v4 as uuid } from 'uuid';
import { ChatMessage } from '@/types';
import { IpcRequestPayload, IpcChannels } from '@/types/ipc';
import { useAlertStore } from '@/renderer/stores/alertStore';
import { getSafeErrorMessage } from '@/renderer/lib/error';
import MessageList from '../chat/MessageList';
import ChecklistMentionInput, {
  ChecklistOption,
} from './ChecklistMentionInput';
import { ReviewChatApi } from '../../service/reviewChatApi';

interface ReviewChatPanelProps {
  open: boolean;
  onClose: () => void;
  reviewHistoryId: string;
  checklists: ChecklistOption[];
  width?: number;
}

// customFetch関数 - ChatArea.tsxを参考に実装
const customFetch: typeof fetch = async (input, init) => {
  if (typeof input === 'string' && input === '/api/review-chat') {
    let unsubscribe: () => void;
    const encoder = new TextEncoder();
    const reviewChatApi = ReviewChatApi.getInstance();

    const stream = new ReadableStream({
      start(controller) {
        unsubscribe = reviewChatApi.streamResponse({
          onMessage(raw) {
            controller.enqueue(encoder.encode(raw));
          },
          onDone() {
            controller.close();
          },
          onError(err) {
            controller.error(err);
          },
        });

        const { reviewHistoryId, checklistIds, question } = JSON.parse(
          init!.body as string,
        ) as IpcRequestPayload<typeof IpcChannels.REVIEW_CHAT_SEND_MESSAGE>;

        init?.signal?.addEventListener('abort', () => {
          reviewChatApi.abortChat(reviewHistoryId, {
            showAlert: false,
            throwError: true,
          });
          unsubscribe();
          controller.close();
        });

        reviewChatApi.sendMessage(reviewHistoryId, checklistIds, question, {
          // 上記onErrorでstreamのエラー処理として処理され、エラーメッセージが表示されるためここでは表示しない
          showAlert: false,
          throwError: false,
        });
      },
      cancel() {
        unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        // SSE＋Data Stream Protocol ヘッダ
        'Content-Type': 'text/event-stream; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      },
    });
  }

  return fetch(input, init);
};

// プレースホルダーテキストを取得する関数
const getPlaceholderText = (status: string): string => {
  if (status === 'submitted') return 'メッセージ送信中…';
  return '@でチェックリストを選択して質問してください';
};

const ReviewChatPanel: React.FC<ReviewChatPanelProps> = ({
  open,
  onClose,
  reviewHistoryId,
  checklists,
  width = 500,
}) => {
  const [input, setInput] = useState<string>('');
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<number[]>(
    [],
  );
  const addAlert = useAlertStore((state) => state.addAlert);

  const { messages, setMessages, reload, status, error, stop } = useChat({
    id: reviewHistoryId,
    api: '/api/review-chat',
    fetch: customFetch,
    experimental_throttle: 75,
    experimental_prepareRequestBody: (request) => {
      // Ensure messages array is not empty and get the last message
      const lastMessage =
        request.messages.length > 0
          ? request.messages[request.messages.length - 1]
          : null;
      if (!lastMessage) {
        throw new Error('送信メッセージの取得に失敗しました');
      }

      // Return the structured body for API route
      return {
        reviewHistoryId,
        checklistIds: selectedChecklistIds,
        question: lastMessage.content,
      } as IpcRequestPayload<typeof IpcChannels.REVIEW_CHAT_SEND_MESSAGE>;
    },
    onError(err) {
      console.error('useChat error:', err);
    },
  });

  // useChatのエラーをアラートとして表示
  useEffect(() => {
    if (error) {
      addAlert({
        message: getSafeErrorMessage(error),
        severity: 'error',
      });
    }
  }, [error, addAlert]);

  // レビューID変更時にチャット内容を初期化
  useEffect(() => {
    setMessages([]);
    setInput('');
    setSelectedChecklistIds([]);
  }, [reviewHistoryId, setMessages]);

  /* ---------- メッセージ送信処理 ---------- */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;

      // チェックリスト未選択の場合は警告
      if (selectedChecklistIds.length === 0) {
        addAlert({
          message: '@でチェックリストを選択してください',
          severity: 'warning',
        });
        return;
      }

      // 選択されたチェックリストの内容を取得してフォーマット
      const selectedChecklistContents = selectedChecklistIds
        .map((id) => {
          const checklist = checklists.find((cl) => cl.id === id);
          return checklist ? `@${checklist.content}` : null;
        })
        .filter((content): content is string => content !== null);

      // チェックリスト部分 + 空行 + 本文の形式でメッセージを構築
      const formattedContent =
        selectedChecklistContents.length > 0
          ? `${selectedChecklistContents.join('\n')}\n\n${input}`
          : input;

      const newMessage: ChatMessage = {
        id: uuid(),
        role: 'user',
        content: formattedContent,
        parts: [
          {
            type: 'text',
            text: formattedContent,
          },
        ],
      };

      setInput('');
      setMessages((prev) => [...prev, newMessage]);
      reload();
    },
    [input, selectedChecklistIds, checklists, addAlert, setMessages, reload],
  );

  if (!open) return null;

  return (
    <Box
      sx={{
        width,
        minWidth: 300,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'relative',
      }}
    >
      {/* ヘッダー（閉じるボタン） */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* メッセージリスト */}
      <MessageList
        messages={messages}
        loading={false}
        status={status}
        editContent=""
        disabled={status === 'submitted' || status === 'streaming'}
        editingMessageId=""
        onEditStart={() => {}}
        onEditContentChange={() => {}}
        onEditSubmit={async () => {}}
        onEditCancel={() => {}}
        loadingMessage="ドキュメントの調査中..."
        disableEdit
      />

      <Divider />

      {/* メッセージ入力 */}
      <ChecklistMentionInput
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        message={input}
        disabled={status === 'submitted' || status === 'streaming'}
        placeholder={getPlaceholderText(status)}
        isStreaming={status === 'streaming'}
        onStop={stop}
        checklists={checklists}
        selectedChecklistIds={selectedChecklistIds}
        onChecklistSelect={setSelectedChecklistIds}
      />
    </Box>
  );
};

export default ReviewChatPanel;
