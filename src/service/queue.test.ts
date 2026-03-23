import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database
const mockDbInstance = {
  prepare: vi.fn(),
};

vi.mock('./db.js', () => ({
  getDb: () => mockDbInstance,
}));

// Import after mocking
import { TaskQueue } from './queue.js';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  const createMockTaskRow = (overrides = {}) => ({
    id: 'test-uuid-1234',
    type: 'publish',
    platform: 'douyin',
    status: 'pending',
    title: 'Test Task',
    payload: '{}',
    result: null,
    error: null,
    progress: 0,
    retry_count: 0,
    max_retries: 3,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: 1,
    ...overrides,
  });

  beforeEach(() => {
    queue = new TaskQueue();
    vi.clearAllMocks();
    mockDbInstance.prepare.mockReturnValue({
      run: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
    });
  });

  describe('create()', () => {
    it('should create a task with pending status', () => {
      const task = queue.create({
        type: 'publish',
        platform: 'douyin',
        title: 'Test Task',
        payload: { content: 'Hello' },
      });

      expect(task.id).toBe('test-uuid-1234');
      expect(task.status).toBe('pending');
      expect(task.type).toBe('publish');
      expect(task.platform).toBe('douyin');
    });

    it('should create scheduled task with correct scheduledAt', () => {
      const scheduledTime = Date.now() + 3600000;

      const task = queue.create({
        type: 'publish',
        platform: 'douyin',
        title: 'Scheduled Task',
        payload: {},
        scheduledAt: scheduledTime,
      });

      expect(task.scheduledAt).toBe(scheduledTime);
    });

    it('should set default maxRetries to 3', () => {
      const task = queue.create({
        type: 'publish',
        platform: 'douyin',
        title: 'Test',
        payload: {},
      });

      expect(task.maxRetries).toBe(3);
    });
  });

  describe('get()', () => {
    it('should return null when task not found', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      });

      const task = queue.get('nonexistent');

      expect(task).toBeNull();
    });

    it('should return task when found', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(createMockTaskRow()),
      });

      const task = queue.get('test-uuid-1234');

      expect(task).not.toBeNull();
      expect(task?.id).toBe('test-uuid-1234');
    });
  });

  describe('list()', () => {
    it('should return empty array when no tasks', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      const tasks = queue.list();

      expect(tasks).toEqual([]);
    });

    it('should return tasks with correct structure', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([createMockTaskRow()]),
      });

      const tasks = queue.list();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].platform).toBe('douyin');
    });

    it('should respect limit parameter', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      queue.list({ limit: 10 });

      expect(mockDbInstance.prepare).toHaveBeenCalled();
    });
  });

  describe('cancel()', () => {
    it('should update status to cancelled', () => {
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow()),
      });
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ status: 'cancelled' })),
      });

      const task = queue.cancel('test-uuid-1234');

      expect(task?.status).toBe('cancelled');
    });
  });

  describe('getStats()', () => {
    it('should return statistics with all counters', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue({
          total: 100,
          pending: 10,
          running: 5,
          completed: 80,
          failed: 3,
          deferred: 2,
        }),
      });

      const stats = queue.getStats();

      expect(stats.total).toBe(100);
      expect(stats.pending).toBe(10);
      expect(stats.running).toBe(5);
      expect(stats.completed).toBe(80);
      expect(stats.failed).toBe(3);
      expect(stats.deferred).toBe(2);
    });

    it('should handle null values gracefully', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue({
          total: 0,
          pending: 0,
          running: 0,
          completed: 0,
          failed: 0,
          deferred: 0,
        }),
      });

      const stats = queue.getStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
    });
  });

  describe('markFailed()', () => {
    it('should increment retry count when under max', () => {
      // First call to get() in markFailed
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ retry_count: 0 })),
      });
      // UPDATE query
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      // Second call to get() to return updated task
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ status: 'deferred', retry_count: 1 })),
      });

      const task = queue.markFailed('test-uuid-1234', 'Network error');

      expect(task?.retryCount).toBe(1);
      expect(task?.status).toBe('deferred');
    });

    it('should mark as failed when max retries exceeded', () => {
      // First get() in markFailed
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ retry_count: 2, max_retries: 3 })),
      });
      // get() in updateStatus
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ retry_count: 2, max_retries: 3 })),
      });
      // UPDATE in updateStatus
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      // Final get() in updateStatus
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(
          createMockTaskRow({ status: 'failed', retry_count: 3, error: '重试次数耗尽: Network error' })
        ),
      });

      const task = queue.markFailed('test-uuid-1234', 'Network error');

      expect(task?.status).toBe('failed');
      expect(task?.error).toContain('重试次数耗尽');
    });
  });
});
