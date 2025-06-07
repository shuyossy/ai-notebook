/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import MessageList from '../../../renderer/components/chat/MessageList';
import type { ChatMessage } from '../../../renderer/main/types';

jest.mock('../../../renderer/components/chat/MessageItem', () => (props: any) => (
  <div data-testid={`item-${props.message.id}`}></div>
));

describe('MessageList', () => {
  const messages: ChatMessage[] = [
    { id: '1', role: 'user', content: 'hi', createdAt: '', updatedAt: '' },
    { id: '2', role: 'assistant', content: 'hello', createdAt: '', updatedAt: '' },
  ] as any;

  const defaultProps = {
    messages,
    loading: false,
    status: 'ready' as const,
    editContent: '',
    disabled: false,
    onEditStart: jest.fn(),
    editingMessageId: '',
    onEditSubmit: jest.fn(),
    onEditContentChange: jest.fn(),
    onEditCancel: jest.fn(),
  };

  test('renders message items', () => {
    render(<MessageList {...defaultProps} />);
    expect(screen.getByTestId('item-1')).toBeInTheDocument();
    expect(screen.getByTestId('item-2')).toBeInTheDocument();
  });

  test('shows streaming and loading indicators', () => {
    const { rerender } = render(
      <MessageList {...defaultProps} status="streaming" />,
    );
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
    rerender(<MessageList {...defaultProps} loading />);
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
  });
});
