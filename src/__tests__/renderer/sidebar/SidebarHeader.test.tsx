/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarHeader from '../../../renderer/components/sidebar/SidebarHeader';

describe('SidebarHeader', () => {
  test('calls onCreateRoom on button click', () => {
    const fn = jest.fn();
    render(<SidebarHeader onCreateRoom={fn} />);
    fireEvent.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalled();
  });
});
