/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarFooter from '../../../renderer/components/sidebar/SidebarFooter';

describe('SidebarFooter', () => {
  const defaultProps = {
    onSettingsClick: jest.fn(),
    onOpenSourceList: jest.fn(),
    sourceStatus: { processing: false, enabledCount: 120 },
    settingsHasError: false,
  };

  test('renders badge content and handles clicks', () => {
    render(<SidebarFooter {...defaultProps} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(defaultProps.onOpenSourceList).toHaveBeenCalled();
    expect(defaultProps.onSettingsClick).toHaveBeenCalled();
  });

  test('shows progress when processing', () => {
    render(
      <SidebarFooter
        {...defaultProps}
        sourceStatus={{ processing: true, enabledCount: 2 }}
      />,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
