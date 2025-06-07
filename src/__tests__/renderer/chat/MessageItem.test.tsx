/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageItem from '../../../renderer/components/chat/MessageItem';
import type { ChatMessage } from '../../../renderer/main/types';

describe('MessageItem', () => {
  const message: ChatMessage = {
    id: '1',
    role: 'user',
    content: 'hello',
    createdAt: '',
    updatedAt: '',
  } as any;

  const defaultProps = {
    message,
    editContent: 'edit',
    disabled: false,
    onEditSubmit: jest.fn(),
    isEditing: false,
    onEditStart: jest.fn(),
    onEditContentChange: jest.fn(),
    onEditCancel: jest.fn(),
  };

  test('calls onEditStart when edit button clicked', () => {
    render(<MessageItem {...defaultProps} />);
    const btn = document.querySelector('.editBtn') as HTMLElement;
    fireEvent.click(btn);
    expect(defaultProps.onEditStart).toHaveBeenCalledWith('1');
  });

  test('editing mode renders textbox', () => {
    render(<MessageItem {...defaultProps} isEditing />);
    const textbox = screen.getByRole('textbox');
    expect(textbox).toHaveValue('edit');
    fireEvent.change(textbox, { target: { value: 'new' } });
    expect(defaultProps.onEditContentChange).toHaveBeenCalledWith('new');
  });
});
