/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatRoomList from '../../../renderer/components/sidebar/ChatRoomList';
import type { ChatRoom } from '../../../renderer/main/types';

describe('ChatRoomList', () => {
  const rooms: ChatRoom[] = [
    {
      id: '1',
      title: 'room1',
      createdAt: '',
      updatedAt: '',
    },
  ];
  const onSelect = jest.fn();
  const onMenu = jest.fn();

  test('loading state', () => {
    render(
      <ChatRoomList
        rooms={rooms}
        selectedRoomId={null}
        onRoomSelect={onSelect}
        onMenuOpen={onMenu}
        loading
      />,
    );
    expect(screen.getByText('チャット履歴取得中')).toBeInTheDocument();
  });

  test('empty rooms', () => {
    render(
      <ChatRoomList
        rooms={[]}
        selectedRoomId={null}
        onRoomSelect={onSelect}
        onMenuOpen={onMenu}
      />,
    );
    expect(screen.getByText('チャット履歴がありません')).toBeInTheDocument();
  });

  test('selects room and opens menu', () => {
    render(
      <ChatRoomList
        rooms={rooms}
        selectedRoomId={null}
        onRoomSelect={onSelect}
        onMenuOpen={onMenu}
      />,
    );
    fireEvent.click(screen.getByText('room1'));
    expect(onSelect).toHaveBeenCalledWith('1');
    fireEvent.click(screen.getByLabelText('more'));
    expect(onMenu).toHaveBeenCalled();
  });
});
