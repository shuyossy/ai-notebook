/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SnackbarNotification from '../../../renderer/components/common/SnackbarNotification';

describe('SnackbarNotification', () => {
  test('renders message and calls onClose', () => {
    const handleClose = jest.fn();
    render(
      <SnackbarNotification
        open
        message="hello"
        severity="error"
        onClose={handleClose}
      />,
    );

    expect(screen.getByText('hello')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(handleClose).toHaveBeenCalled();
  });
});
