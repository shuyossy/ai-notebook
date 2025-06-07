/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../../../renderer/components/common/Modal';

describe('Modal', () => {
  test('renders title and children and handles close', () => {
    const handleClose = jest.fn();
    render(
      <Modal open title="Test Title" onClose={handleClose}>
        <div>Content</div>
      </Modal>,
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('close'));
    expect(handleClose).toHaveBeenCalled();
  });

  test('renders actions when provided', () => {
    const handleClose = jest.fn();
    render(
      <Modal
        open
        title="Actions"
        onClose={handleClose}
        actions={<button>ok</button>}
      >
        body
      </Modal>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
