import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmModal } from '../../components/ConfirmModal';

describe('ConfirmModal', () => {
  const defaultProps = {
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and message correctly', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('renders confirm and cancel buttons with default labels', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('renders custom button labels when provided', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        confirmLabel='Delete'
        cancelLabel='Keep'
      />
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    render(<ConfirmModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(<ConfirmModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    render(<ConfirmModal {...defaultProps} />);
    const overlay = document.querySelector('.confirm-overlay');
    if (overlay) {
      fireEvent.click(overlay);
    }
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('has role dialog and aria-modal true', () => {
    render(<ConfirmModal {...defaultProps} />);
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  it('stops propagation when modal content is clicked', () => {
    render(<ConfirmModal {...defaultProps} />);
    const modal = screen.getByRole('dialog');
    // Clicking inside modal should not trigger overlay onCancel
    fireEvent.click(modal);
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('applies variant class to confirm button', () => {
    const { rerender } = render(<ConfirmModal {...defaultProps} variant='danger' />);
    const confirmBtn = screen.getByRole('button', { name: '确认' });
    expect(confirmBtn.className).toContain('btn-danger');

    rerender(<ConfirmModal {...defaultProps} variant='warning' />);
    expect(confirmBtn.className).toContain('btn-warning');
  });
});
