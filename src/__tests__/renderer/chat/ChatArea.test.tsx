/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ChatArea from '../../../renderer/components/chat/ChatArea';

jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    setMessages: jest.fn(),
    reload: jest.fn(),
    input: '',
    status: 'ready',
    error: null,
    handleInputChange: jest.fn(),
    handleSubmit: jest.fn(),
    stop: jest.fn(),
  }),
}));

jest.mock('../../../renderer/hooks/useAgentStatus', () => () => ({
  status: { state: 'ready', messages: [] },
  closeMessage: jest.fn(),
}));

jest.mock('../../../renderer/stores/agentStore', () => ({
  useAgentStore: () => ({ status: { messages: [] }, closeMessage: jest.fn() }),
}));

jest.mock('../../../renderer/services/chatService', () => ({
  chatService: { getChatMessages: jest.fn().mockResolvedValue([]) },
}));

describe('ChatArea', () => {
  test('shows instruction when no room selected', () => {
    render(<ChatArea selectedRoomId={null} />);
    expect(screen.getByText('チャットルームを選択してください')).toBeInTheDocument();
  });

  test('shows input when room selected', async () => {
    render(<ChatArea selectedRoomId="room" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('メッセージを入力してください')).toBeInTheDocument();
    });
  });
});
