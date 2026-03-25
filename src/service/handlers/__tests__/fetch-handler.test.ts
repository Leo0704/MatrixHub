import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFetchDataTask } from '../fetch-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('../../data-fetcher/index.js', () => ({
  createFetcher: vi.fn().mockReturnValue({
    fetchHotTopics: vi.fn().mockResolvedValue({
      topics: [{ id: '1', title: 'Hot Topic', heat: 1000, rank: 1, link: '', platform: 'douyin' as const, fetchedAt: Date.now() }],
      source: 'douyin',
      fetchedAt: Date.now(),
    }),
    close: vi.fn(),
    platform: 'douyin',
  }),
  createAllFetchers: vi.fn().mockReturnValue([]),
}));

vi.mock('../../platform-launcher.js', () => ({
  createPage: vi.fn().mockResolvedValue({
    goto: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(),
  }),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  checkLoginState: vi.fn().mockResolvedValue(true),
  navigateTo: vi.fn(),
  randomDelay: vi.fn(),
}));

describe('Fetch Handler', () => {
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'fetch_data',
      payload: { dataType: 'hot_topics', platform: 'douyin' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as unknown as AbortSignal;
  });

  it('should fetch hot topics for a specific platform', async () => {
    const result = await executeFetchDataTask(mockTask, mockSignal);

    expect(result).toHaveProperty('topics');
    expect(Array.isArray(result.topics)).toBe(true);
  });

  it('should throw on unknown data type', async () => {
    const unknownTask = {
      ...mockTask,
      payload: { dataType: 'unknown_type' },
    } as Task;

    await expect(executeFetchDataTask(unknownTask, mockSignal))
      .rejects.toThrow('未知数据类型');
  });

  it('should throw if account is not logged in for content_stats', async () => {
    const contentTask = {
      ...mockTask,
      payload: { dataType: 'content_stats', accountId: 'acc-1' },
    } as Task;
    const { checkLoginState } = await import('../../utils/page-helpers.js');
    checkLoginState.mockResolvedValueOnce(false);

    await expect(executeFetchDataTask(contentTask, mockSignal))
      .rejects.toThrow('抖音账号未登录');
  });

  it('should fetch content stats successfully', async () => {
    const contentTask = {
      ...mockTask,
      payload: { dataType: 'content_stats', accountId: 'acc-1' },
    } as Task;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = await createPage() as any;
    mockPage.evaluate.mockResolvedValueOnce({
      totalViews: 1000,
      totalLikes: 100,
      totalComments: 50,
      totalShares: 20,
    });

    const result = await executeFetchDataTask(contentTask, mockSignal);

    expect(result).toHaveProperty('totalViews', 1000);
    expect(result).toHaveProperty('totalLikes', 100);
  });

  it('should fetch account stats successfully', async () => {
    const accountTask = {
      ...mockTask,
      payload: { dataType: 'account_stats', accountId: 'acc-1' },
    } as Task;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = await createPage() as any;
    mockPage.evaluate.mockResolvedValueOnce({
      followers: 5000,
      following: 200,
      totalPosts: 50,
      engagementRate: 5.5,
    });

    const result = await executeFetchDataTask(accountTask, mockSignal);

    expect(result).toHaveProperty('followers', 5000);
    expect(result).toHaveProperty('engagementRate', 5.5);
  });

  it('should throw when content stats extraction fails', async () => {
    const contentTask = {
      ...mockTask,
      payload: { dataType: 'content_stats', accountId: 'acc-1' },
    } as Task;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = await createPage() as any;
    mockPage.evaluate.mockResolvedValueOnce({
      totalViews: null,
      totalLikes: null,
    });

    await expect(executeFetchDataTask(contentTask, mockSignal))
      .rejects.toThrow('无法从页面提取内容统计数据');
  });

  it('should throw when account stats extraction fails', async () => {
    const accountTask = {
      ...mockTask,
      payload: { dataType: 'account_stats', accountId: 'acc-1' },
    } as Task;
    const { createPage } = await import('../../platform-launcher.js');
    const mockPage = await createPage() as any;
    mockPage.evaluate.mockResolvedValueOnce({
      followers: null,
    });

    await expect(executeFetchDataTask(accountTask, mockSignal))
      .rejects.toThrow('无法从页面提取账号统计数据');
  });

  it('should clean up fetcher in finally block', async () => {
    const fetcherMock = {
      fetchHotTopics: vi.fn().mockResolvedValue({ topics: [], source: 'douyin', fetchedAt: Date.now() }),
      close: vi.fn(),
      platform: 'douyin',
    };
    const { createFetcher } = await import('../../data-fetcher/index.js');
    createFetcher.mockReturnValueOnce(fetcherMock);

    await executeFetchDataTask(mockTask, mockSignal);

    expect(fetcherMock.close).toHaveBeenCalled();
  });

  it('should handle fetcher errors gracefully in multi-platform fetch', async () => {
    const failingFetcher = {
      fetchHotTopics: vi.fn().mockRejectedValue(new Error('Network error')),
      close: vi.fn(),
      platform: 'douyin',
    };
    const { createAllFetchers } = await import('../../data-fetcher/index.js');
    createAllFetchers.mockReturnValueOnce([failingFetcher]);

    const multiPlatformTask = {
      ...mockTask,
      payload: { dataType: 'hot_topics' },
    } as Task;

    const result = await executeFetchDataTask(multiPlatformTask, mockSignal);

    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('error');
  });
});
