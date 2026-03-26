import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast, ToastProvider, useToast, type ToastMessage } from '../../components/Toast';

// Test component that uses the toast context
function TestConsumer() {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast('Test Title', 'Test Message', 'success')}>
      Show Toast
    </button>
  );
}

// Test component that uses useToast outside provider to verify no-op behavior
function TestOutsideProvider() {
  const { showToast } = useToast();
  return (
    <div>
      <span data-testid='showToast-value'>{typeof showToast === 'function' ? 'function' : 'not-function'}</span>
      <button onClick={() => showToast('test')}>Call showToast</button>
    </div>
  );
}

describe('Toast', () => {
  describe('ToastProvider', () => {
    it('provides showToast function to children', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );
      expect(screen.getByText('Show Toast')).toBeInTheDocument();
    });
  });

  describe('useToast', () => {
    it('returns function from useToast inside provider', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      );
      const button = screen.getByText('Show Toast');
      expect(button).toBeInTheDocument();
    });

    it('returns no-op showToast when used outside provider', () => {
      // When useToast is called outside a ToastProvider, it returns { showToast: () => {} }
      // We test this by verifying the component still renders (doesn't crash)
      // and showToast is a function (the no-op)
      render(<TestOutsideProvider />);
      expect(screen.getByTestId('showToast-value')).toHaveTextContent('function');
    });
  });

  describe('Toast component', () => {
    let originalClearTimeout: typeof clearTimeout;
    let originalSetTimeout: typeof setTimeout;

    beforeEach(() => {
      originalClearTimeout = clearTimeout;
      originalSetTimeout = setTimeout;
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      global.clearTimeout = originalClearTimeout;
      global.setTimeout = originalSetTimeout;
    });

    it('renders toasts with correct content', () => {
      const toasts: ToastMessage[] = [
        { id: '1', type: 'success', title: 'Success', message: 'Operation completed' },
      ];
      render(<Toast toasts={toasts} onDismiss={vi.fn()} />);
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Operation completed')).toBeInTheDocument();
    });

    it('renders multiple toasts', () => {
      const toasts: ToastMessage[] = [
        { id: '1', type: 'success', title: 'First' },
        { id: '2', type: 'error', title: 'Second' },
      ];
      render(<Toast toasts={toasts} onDismiss={vi.fn()} />);
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
    });

    it('calls onDismiss when close button is clicked', () => {
      const onDismiss = vi.fn();
      const toasts: ToastMessage[] = [
        { id: '1', type: 'info', title: 'Test' },
      ];
      render(<Toast toasts={toasts} onDismiss={onDismiss} />);
      fireEvent.click(screen.getByRole('button', { name: '关闭通知' }));
      expect(onDismiss).toHaveBeenCalledWith('1');
    });

    it('renders correct icon for each toast type', () => {
      const toasts: ToastMessage[] = [
        { id: '1', type: 'success', title: 'Success' },
        { id: '2', type: 'error', title: 'Error' },
        { id: '3', type: 'warning', title: 'Warning' },
        { id: '4', type: 'info', title: 'Info' },
      ];
      render(<Toast toasts={toasts} onDismiss={vi.fn()} />);
      expect(screen.getByText('✅')).toBeInTheDocument();
      expect(screen.getByText('❌')).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument();
      expect(screen.getByText('ℹ️')).toBeInTheDocument();
    });

    it('has role alert and aria-live polite', () => {
      const toasts: ToastMessage[] = [
        { id: '1', type: 'info', title: 'Test' },
      ];
      render(<Toast toasts={toasts} onDismiss={vi.fn()} />);
      const container = screen.getByRole('alert');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });

    it('auto-dismisses after duration', () => {
      const onDismiss = vi.fn();
      const toasts: ToastMessage[] = [
        { id: '1', type: 'info', title: 'Test', duration: 4000 },
      ];
      render(<Toast toasts={toasts} onDismiss={onDismiss} />);
      
      vi.advanceTimersByTime(4200);
      
      expect(onDismiss).toHaveBeenCalledWith('1');
    });

    it('uses custom duration when provided', () => {
      const onDismiss = vi.fn();
      const toasts: ToastMessage[] = [
        { id: '1', type: 'info', title: 'Test', duration: 2000 },
      ];
      render(<Toast toasts={toasts} onDismiss={onDismiss} />);
      
      vi.advanceTimersByTime(2200);
      
      expect(onDismiss).toHaveBeenCalledWith('1');
    });
  });
});
