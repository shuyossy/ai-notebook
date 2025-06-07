/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageInput from '../../../renderer/components/chat/MessageInput';

describe('MessageInput', () => {
  const defaultProps = {
    handleSubmit: jest.fn((e) => e.preventDefault()),
    handleInputChange: jest.fn(),
    message: 'hi',
    disabled: false,
    placeholder: 'type...',
    isStreaming: false,
    onStop: jest.fn(),
  };

  test('submits on Enter key', () => {
    render(<MessageInput {...defaultProps} />);
    const input = screen.getByPlaceholderText('type...');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.handleSubmit).toHaveBeenCalled();
  });

  test('does not submit when composing or with shift', () => {
    render(<MessageInput {...defaultProps} />);
    const input = screen.getByPlaceholderText('type...');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    // should be called only once from first test
    expect(defaultProps.handleSubmit).toHaveBeenCalledTimes(1);
  });

  test('stop button when streaming', () => {
    render(<MessageInput {...defaultProps} isStreaming />);
    fireEvent.click(screen.getByRole('button'));
    expect(defaultProps.onStop).toHaveBeenCalled();
  });
});
