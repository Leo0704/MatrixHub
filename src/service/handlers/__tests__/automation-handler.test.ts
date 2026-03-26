import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAutomationTask } from '../automation-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('../../platform-launcher.js', () => ({
  markPageLoggedIn: vi.fn(),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  navigateTo: vi.fn(),
  randomDelay: vi.fn(),
  checkLoginState: vi.fn().mockResolvedValue(true),
  humanClick: vi.fn(),
  humanScroll: vi.fn(),
}));

vi.mock('../../config/selectors.js', () => ({
  getAutoSelectors: vi.fn().mockReturnValue([{ value: '.selector' }]),
  AUTOMATION_PATHS: {
    douyin: { self_posts: '/posts', discovery: '/discovery', comments: '/comments' },
    kuaishou: { self_posts: '/posts', discovery: '/discovery', comments: '/comments' },
    xiaohongshu: { self_posts: '/posts', discovery: '/discovery', comments: '/comments' },
  },
}));

describe('Automation Handler', () => {
  let mockPage: any;
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = {
      $$: vi.fn().mockResolvedValue([]),
      $: vi.fn().mockResolvedValue({ textContent: vi.fn().mockResolvedValue('已关注') }),
      fill: vi.fn(),
      keyboard: { press: vi.fn() },
    };
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'automation',
      payload: { action: 'auto_reply', platform: 'douyin', accountId: 'acc-1' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should throw when account is not logged in', async () => {
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    checkLoginState.mockResolvedValueOnce(false);

    await expect(executeAutomationTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('账号未登录或 Session 已过期');
    expect(checkLoginState).toHaveBeenCalled();
  });

  it('should throw if aborted before starting', async () => {
    mockSignal.throwIfAborted.mockImplementationOnce(() => {
      throw new Error('AbortError');
    });

    await expect(executeAutomationTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('AbortError');
  });

  it('should throw on unknown action type', async () => {
    const unknownTask = {
      ...mockTask,
      payload: { action: 'unknown_action', platform: 'douyin' },
    } as any;

    await expect(executeAutomationTask(mockPage, unknownTask, mockSignal))
      .rejects.toThrow('未知自动化操作');
  });

  it('should mark page as logged in after successful login check', async () => {
    const { markPageLoggedIn } = await import('../../platform-launcher.js');

    await executeAutomationTask(mockPage, mockTask, mockSignal);

    expect(markPageLoggedIn).toHaveBeenCalledWith(mockPage, 'acc-1');
  });

  it('should execute auto_reply action successfully', async () => {
    const { navigateTo } = await import('../../utils/page-helpers.js');

    const result = await executeAutomationTask(mockPage, mockTask, mockSignal);

    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('replied');
    expect(result.platform).toBe('douyin');
    expect(navigateTo).toHaveBeenCalled();
  });

  it('should execute comment_management action successfully', async () => {
    const commentTask = {
      ...mockTask,
      payload: { action: 'comment_management', platform: 'douyin', accountId: 'acc-1' },
    } as any;

    const result = await executeAutomationTask(mockPage, commentTask, mockSignal);

    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('comments');
    expect(result).toHaveProperty('count');
  });
});
