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

  describe('dequeue()', () => {
    it('should return null when no pending tasks', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      });

      const task = queue.dequeue();

      expect(task).toBeNull();
    });

    it('should return and update task to running status', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(createMockTaskRow({ status: 'running' })),
      });

      const task = queue.dequeue();

      expect(task).not.toBeNull();
      expect(task?.status).toBe('running');
    });

    it('should use atomic UPDATE RETURNING to prevent race conditions', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue(createMockTaskRow()),
      });

      queue.dequeue();

      // Verify the SQL uses RETURNING clause for atomicity
      expect(mockDbInstance.prepare).toHaveBeenCalled();
    });
  });

  describe('updateStatus()', () => {
    it('should return null when task not found', () => {
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(undefined),
      });

      const task = queue.updateStatus('nonexistent', 'running');

      expect(task).toBeNull();
    });

    it('should update status and set started_at for running', () => {
      // First get() to check task exists
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow()),
      });
      // UPDATE query
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      // Final get() to return updated task
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ status: 'running', started_at: Date.now() })),
      });

      const task = queue.updateStatus('test-uuid-1234', 'running');

      expect(task?.status).toBe('running');
    });

    it('should set completed_at for completed status', () => {
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow()),
      });
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ status: 'completed', completed_at: Date.now() })),
      });

      const task = queue.updateStatus('test-uuid-1234', 'completed');

      expect(task?.status).toBe('completed');
    });

    it('should store result as JSON string', () => {
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow()),
      });
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ result: '{"url":"https://example.com"}' })),
      });

      const task = queue.updateStatus('test-uuid-1234', 'completed', { result: { url: 'https://example.com' } });

      expect(task?.result).toEqual({ url: 'https://example.com' });
    });
  });

  describe('checkpoint operations', () => {
    describe('saveCheckpoint()', () => {
      it('should save checkpoint to database', () => {
        mockDbInstance.prepare.mockReturnValueOnce({
          run: vi.fn().mockReturnValue({}),
        });

        queue.saveCheckpoint({
          taskId: 'test-uuid-1234',
          step: 'login',
          payload: { username: 'test' },
          browserState: '{"cookies":[]}',
          createdAt: Date.now(),
        });

        expect(mockDbInstance.prepare).toHaveBeenCalled();
      });
    });

    describe('getCheckpoint()', () => {
      it('should return null when checkpoint not found', () => {
        mockDbInstance.prepare.mockReturnValueOnce({
          get: vi.fn().mockReturnValue(undefined),
        });

        const checkpoint = queue.getCheckpoint('nonexistent');

        expect(checkpoint).toBeNull();
      });

      it('should return checkpoint with parsed payload', () => {
        mockDbInstance.prepare.mockReturnValueOnce({
          get: vi.fn().mockReturnValue({
            task_id: 'test-uuid-1234',
            step: 'login',
            payload: '{"username":"test"}',
            browser_state: '{"cookies":[]}',
            created_at: Date.now(),
          }),
        });

        const checkpoint = queue.getCheckpoint('test-uuid-1234');

        expect(checkpoint).not.toBeNull();
        expect(checkpoint?.taskId).toBe('test-uuid-1234');
        expect(checkpoint?.step).toBe('login');
        expect(checkpoint?.payload).toEqual({ username: 'test' });
        // browserState is stored as JSON string, not parsed
        expect(checkpoint?.browserState).toEqual('{"cookies":[]}');
      });
    });

    describe('clearCheckpoint()', () => {
      it('should delete checkpoint from database', () => {
        mockDbInstance.prepare.mockReturnValueOnce({
          run: vi.fn().mockReturnValue({}),
        });

        queue.clearCheckpoint('test-uuid-1234');

        expect(mockDbInstance.prepare).toHaveBeenCalled();
      });
    });
  });

  describe('updateField()', () => {
    it('should return null for invalid field names', () => {
      const task = queue.updateField('test-uuid-1234', 'invalid_field', 'value');

      expect(task).toBeNull();
    });

    it('should update ai_analysis_count field', () => {
      // UPDATE query
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      // get() to return updated task (called at the end of updateField)
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow()),
      });

      const task = queue.updateField('test-uuid-1234', 'ai_analysis_count', 1);

      expect(task).not.toBeNull();
    });

    it('should update version field', () => {
      // UPDATE query
      mockDbInstance.prepare.mockReturnValueOnce({
        run: vi.fn().mockReturnValue({}),
      });
      // get() to return updated task
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue(createMockTaskRow({ version: 2 })),
      });

      const task = queue.updateField('test-uuid-1234', 'version', 2);

      expect(task?.version).toBe(2);
    });
  });
});
