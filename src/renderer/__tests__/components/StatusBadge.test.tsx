import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../../components/StatusBadge';

describe('StatusBadge', () => {
  it('renders pending status with correct label', () => {
    render(<StatusBadge status='pending' />);
    expect(screen.getByText('等待中')).toBeInTheDocument();
  });

  it('renders running status with correct label', () => {
    render(<StatusBadge status='running' />);
    expect(screen.getByText('执行中')).toBeInTheDocument();
  });

  it('renders completed status with correct label', () => {
    render(<StatusBadge status='completed' />);
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('renders failed status with correct label', () => {
    render(<StatusBadge status='failed' />);
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('renders cancelled status with correct label', () => {
    render(<StatusBadge status='cancelled' />);
    expect(screen.getByText('已取消')).toBeInTheDocument();
  });

  it('renders deferred status with correct label', () => {
    render(<StatusBadge status='deferred' />);
    expect(screen.getByText('延迟')).toBeInTheDocument();
  });

  it('returns content for valid statuses', () => {
    const { container } = render(<StatusBadge status='pending' />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
