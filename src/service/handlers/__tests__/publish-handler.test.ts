import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePublishTask } from '../publish-handler.js';
import type { Task, Page } from '../../../shared/types.js';

vi.mock('../../queue.js', () => ({
  taskQueue: {
    getCheckpoint: vi.fn().mockReturnValue(null),
    saveCheckpoint: vi.fn(),
    clearCheckpoint: vi.fn(),
  },
}));

vi.mock('../../rate-limiter.js', () => ({
  rateLimiter: {
    check: vi.fn().mockReturnValue({ allowed: true }),
    acquire: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../platform-launcher.js', () => ({
  createPage: vi.fn(),
  markPageLoggedIn: vi.fn(),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  navigateToPublish: vi.fn(),
  checkLoginState: vi.fn().mockResolvedValue(true),
  fillPublishForm: vi.fn(),
  confirmPublish: vi.fn(),
  randomDelay: vi.fn(),
}));

vi.mock('../../utils/sleep.js', () => ({
  sleep: vi.fn(),
}));

describe('Publish Handler', () => {
  let mockPage: any;
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = {
      goto: vi.fn(),
      fill: vi.fn(),
      click: vi.fn(),
    };
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'publish',
      payload: { accountId: 'acc-1', title: 'Test', content: 'Content' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should complete publish flow successfully', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { navigateToPublish } = await import('../../utils/page-helpers.js');
    expect(navigateToPublish).toHaveBeenCalledWith(mockPage, 'douyin');
    expect(mockSignal.throwIfAborted).toHaveBeenCalled();
  });

  it('should save checkpoint after navigation', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.saveCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', step: 'login_check' })
    );
  });

  it('should throw when rate limiter is full', async () => {
    const { rateLimiter } = await import('../../rate-limiter.js');
    rateLimiter.acquire.mockResolvedValueOnce(false);

    await expect(executePublishTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('rate_limit_exceeded');
  });

  it('should throw when account is not logged in', async () => {
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    checkLoginState.mockResolvedValueOnce(false);

    await expect(executePublishTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('账号未登录');
  });

  it('should save checkpoint after login check', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    const checkpoints = taskQueue.saveCheckpoint.mock.calls;
    const fillFormCheckpoint = checkpoints.find((call: any) => call[0].step === 'fill_form');
    expect(fillFormCheckpoint).toBeDefined();
  });

  it('should save checkpoint after form fill', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    const checkpoints = taskQueue.saveCheckpoint.mock.calls;
    const confirmCheckpoint = checkpoints.find((call: any) => call[0].step === 'confirm_publish');
    expect(confirmCheckpoint).toBeDefined();
  });

  it('should clear checkpoint after successful publish', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.clearCheckpoint).toHaveBeenCalledWith('task-1');
  });

  it('should mark page as logged in', async () => {
    await executePublishTask(mockPage, mockTask, mockSignal);

    const { markPageLoggedIn } = await import('../../platform-launcher.js');
    expect(markPageLoggedIn).toHaveBeenCalled();
  });

  it('should resume from checkpoint if exists', async () => {
    const { taskQueue } = await import('../../queue.js');
    taskQueue.getCheckpoint.mockReturnValueOnce({ step: 'fill_form', payload: {} });

    await executePublishTask(mockPage, mockTask, mockSignal);

    // Should skip navigate and login check, go directly to fill_form
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    expect(checkLoginState).not.toHaveBeenCalled();
  });

  it('should wait when rate limited', async () => {
    const { rateLimiter } = await import('../../rate-limiter.js');
    rateLimiter.check.mockReturnValueOnce({ allowed: false, waitMs: 5000 });

    await executePublishTask(mockPage, mockTask, mockSignal);

    const { sleep } = await import('../../utils/sleep.js');
    expect(sleep).toHaveBeenCalledWith(5000);
  });
});
