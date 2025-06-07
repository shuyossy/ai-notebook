/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Sidebar from '../../../renderer/components/sidebar/Sidebar';

jest.mock('uuid', () => ({ v4: () => 'uuid' }));

const chatService = {
  getChatRooms: jest.fn().mockResolvedValue([]),
  deleteChatRoom: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../../../renderer/services/chatService', () => ({ chatService }));

jest.mock('../../../renderer/components/common/SourceListModal', () => (props: any) => (
  props.open ? <div>ソース一覧</div> : null
));

jest.mock('../../../renderer/components/common/SettingsModal', () => () => <div />);

describe('Sidebar', () => {
  const defaultProps = {
    selectedRoomId: null,
    onRoomSelect: jest.fn(),
    onReloadSources: jest.fn(),
    showSnackbar: jest.fn(),
  };

  test('new chat button calls onRoomSelect', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('New Chat'));
    expect(defaultProps.onRoomSelect).toHaveBeenCalledWith('uuid');
  });

  test('opens source list modal', async () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.queryByText('ソース一覧')).toBeNull();
    fireEvent.click(screen.getByLabelText('AttachFileIcon'));
    await waitFor(() => {
      expect(screen.getByText('ソース一覧')).toBeInTheDocument();
    });
  });
});
