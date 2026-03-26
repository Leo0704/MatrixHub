import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskRow } from '../../components/TaskRow';
import type { Task } from '~shared/types';

describe('TaskRow', () => {
  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: '1',
    type: 'publish',
    platform: 'douyin',
    status: 'pending',
    title: 'Test Task Title',
    payload: {},
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    version: 1,
    ...overrides,
  });

  it('renders task title correctly', () => {
    const task = createMockTask({ title: 'My Custom Task' });
    render(<TaskRow task={task} />);
    expect(screen.getByText('My Custom Task')).toBeInTheDocument();
  });

  it('renders platform badge with correct label', () => {
    const task = createMockTask({ platform: 'douyin' });
    render(<TaskRow task={task} />);
    expect(screen.getByText('抖音')).toBeInTheDocument();

    const kuaishouTask = createMockTask({ platform: 'kuaishou' });
    render(<TaskRow task={kuaishouTask} />);
    expect(screen.getByText('快手')).toBeInTheDocument();

    const xhsTask = createMockTask({ platform: 'xiaohongshu' });
    render(<TaskRow task={xhsTask} />);
    expect(screen.getByText('小红书')).toBeInTheDocument();
  });

  it('renders pending status label', () => {
    const task = createMockTask({ status: 'pending' });
    render(<TaskRow task={task} />);
    expect(screen.getByText('等待中')).toBeInTheDocument();
  });

  it('renders running status label', () => {
    const task = createMockTask({ status: 'running' });
    render(<TaskRow task={task} />);
    expect(screen.getByText('执行中')).toBeInTheDocument();
  });

  it('renders completed status label', () => {
    const task = createMockTask({ status: 'completed' });
    render(<TaskRow task={task} />);
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('renders failed status label', () => {
    const task = createMockTask({ status: 'failed' });
    render(<TaskRow task={task} />);
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('shows progress bar when task is running with progress', () => {
    const task = createMockTask({ status: 'running', progress: 50 });
    render(<TaskRow task={task} />);
    const progressBar = document.querySelector('[style*="transition"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('does not show progress bar when progress is undefined', () => {
    const task = createMockTask({ status: 'running' });
    render(<TaskRow task={task} />);
    const progressBar = document.querySelector('[style*="transition"]');
    expect(progressBar).toBeNull();
  });

  it('displays formatted time for createdAt', () => {
    const task = createMockTask({ createdAt: Date.now() - 60000 }); // 1 minute ago
    render(<TaskRow task={task} />);
    expect(screen.getByText('1 分钟前')).toBeInTheDocument();
  });
});
