import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Reuse the same mockDb from setup.ts — vi.hoisted makes it available to vi.mock factories
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    })),
    transaction: vi.fn((fn: Function) => fn),
    close: vi.fn(),
    exec: vi.fn(),
    pragma: vi.fn(),
  };
  return { mockDb };
});

// Mock runtime-config
vi.mock('./config/runtime-config.js', () => ({
  getMaintenanceWindows: () => ({ douyin: [], kuaishou: [], xiaohongshu: [] }),
  getErrorWeights: () => ({
    selector: { waitMultiplier: 1.0 },
    rate_limit: { waitMultiplier: 2.0 },
    network: { waitMultiplier: 1.5 },
    login: { waitMultiplier: 1.0 },
    timeout: { waitMultiplier: 1.5 },
    unknown: { waitMultiplier: 1.0 },
  }),
  getTaskStaleTimeout: () => 60 * 60 * 1000,
  getRateLimits: () => ({}),
}));

// Mock db.js to return our mockDb with controllable behavior
vi.mock('./db.js', () => ({
  getDb: () => mockDb,
}));

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    channel: vi.fn(() => ({
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    })),
  },
}));

import { TaskQueue } from './queue.js';

describe('TaskQueue class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.exec?.mockClear();
  });

  // Helper: configure mockDb.prepare for a given SQL to return controlled results
  const setupPrepare = (sql: string, result: any) => {
    mockDb.prepare.mockImplementation((s: string) => {
      if (s.includes(sql)) {
        const mock = {
          run: vi.fn(() => ({ changes: 1 })),
          get: vi.fn(() => result),
          all: vi.fn(() => result),
        };
        return mock;
      }
      return {
        run: vi.fn(() => ({ changes: 1 })),
        get: vi.fn(() => null),
        all: vi.fn(() => []),
      };
    });
  };

  // Helper: configure mockDb.prepare to return a task row for SELECT
  const taskRow = (overrides: Record<string, any> = {}) => ({
    id: 'task-1',
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

  describe('create()', () => {
    it('should create a task with pending status', () => {
      const row = taskRow({ id: 'new-task-1' });
      setupPrepare('INSERT INTO tasks', row);

      const taskQueue = new TaskQueue();
      const task = taskQueue.create({
        type: 'publish',
        platform: 'douyin',
        title: 'Test Task',
        payload: { content: 'hello' },
      });

      expect(task.status).toBe('pending');
      expect(task.type).toBe('publish');
      expect(mockDb.prepare).toHaveBeenCalled();
      const insertCall = mockDb.prepare.mock.calls.find(([s]) => s.includes('INSERT INTO tasks'));
      expect(insertCall).toBeDefined();
    });

    it('should create task with scheduled time', () => {
      const row = taskRow({ id: 'scheduled-task', scheduled_at: Date.now() + 3600000 });
      setupPrepare('INSERT INTO tasks', row);

      const taskQueue = new TaskQueue();
      const task = taskQueue.create({
        type: 'publish',
        platform: 'douyin',
        title: 'Scheduled Task',
        payload: {},
        scheduledAt: Date.now() + 3600000,
      });

      expect(task.scheduledAt).toBeDefined();
    });

    it('should create task with custom maxRetries', () => {
      const row = taskRow({ id: 'custom-retry', max_retries: 5 });
      setupPrepare('INSERT INTO tasks', row);

      const taskQueue = new TaskQueue();
      const task = taskQueue.create({
        type: 'publish',
        platform: 'douyin',
        title: 'Task',
        payload: {},
        maxRetries: 5,
      });

      expect(task.maxRetries).toBe(5);
    });
  });

  describe('get()', () => {
    it('should return null when task not found', () => {
      setupPrepare('SELECT * FROM tasks', null);

      const taskQueue = new TaskQueue();
      const result = taskQueue.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return task when found', () => {
      const row = taskRow({ id: 'found-task', title: 'Found Task' });
      setupPrepare('SELECT * FROM tasks', row);

      const taskQueue = new TaskQueue();
      const result = taskQueue.get('found-task');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('found-task');
      expect(result!.title).toBe('Found Task');
    });
  });

  describe('list()', () => {
    it('should return empty array when no tasks', () => {
      setupPrepare('SELECT * FROM tasks', []);

      const taskQueue = new TaskQueue();
      const tasks = taskQueue.list();
      expect(tasks).toEqual([]);
    });

    it('should return tasks from database', () => {
      const rows = [
        taskRow({ id: 'task-1', title: 'Task 1' }),
        taskRow({ id: 'task-2', title: 'Task 2' }),
      ];
      setupPrepare('SELECT * FROM tasks', rows);

      const taskQueue = new TaskQueue();
      const tasks = taskQueue.list();

      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('should filter by status', () => {
      const rows = [taskRow({ id: 'task-1', status: 'completed' })];
      setupPrepare('SELECT * FROM tasks', rows);

      const taskQueue = new TaskQueue();
      const tasks = taskQueue.list({ status: ['completed'] });

      expect(tasks).toHaveLength(1);
      expect(mockDb.prepare).toHaveBeenCalled();
      const call = mockDb.prepare.mock.calls.find(([s]) => s.includes('SELECT * FROM tasks'));
      expect(call![0]).toContain("status IN");
    });

    it('should filter by platform', () => {
      setupPrepare('SELECT * FROM tasks', []);

      const taskQueue = new TaskQueue();
      taskQueue.list({ platform: 'douyin' });

      const call = mockDb.prepare.mock.calls.find(([s]) => s.includes('SELECT * FROM tasks'));
      expect(call![0]).toContain('platform =');
    });

    it('should respect limit and offset', () => {
      setupPrepare('SELECT * FROM tasks', []);

      const taskQueue = new TaskQueue();
      taskQueue.list({ limit: 10, offset: 5 });

      const call = mockDb.prepare.mock.calls.find(([s]) => s.includes('SELECT * FROM tasks'));
      expect(call![0]).toContain('LIMIT ? OFFSET ?');
    });
  });

  describe('updateStatus()', () => {
    it('should return null when task not found', () => {
      setupPrepare('SELECT * FROM tasks', null);

      const taskQueue = new TaskQueue();
      const result = taskQueue.updateStatus('nonexistent', 'running');
      expect(result).toBeNull();
    });

    it('should update status to running and set started_at', () => {
      const row = taskRow({ id: 'task-1', status: 'running', started_at: Date.now() });
      setupPrepare('SELECT * FROM tasks', row);

      const taskQueue = new TaskQueue();
      const updated = taskQueue.updateStatus('task-1', 'running');

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('running');
      expect(mockDb.prepare).toHaveBeenCalled();
      const updateCall = mockDb.prepare.mock.calls.find(([s]) => s.includes('UPDATE tasks SET'));
      expect(updateCall![0]).toContain('started_at =');
    });

    it('should update to completed with result', () => {
      const row = taskRow({ id: 'task-1', status: 'completed', result: '{"url":"https://example.com"}', completed_at: Date.now() });
      setupPrepare('SELECT * FROM tasks', row);

      const taskQueue = new TaskQueue();
      const updated = taskQueue.updateStatus('task-1', 'completed', { result: { url: 'https://example.com' } });

      expect(updated!.status).toBe('completed');
      expect(updated!.result).toEqual({ url: 'https://example.com' });
    });

    it('should update to failed with error', () => {
      const row = taskRow({ id: 'task-1', status: 'failed', error: 'Network error' });
      setupPrepare('SELECT * FROM tasks', row);

      const taskQueue = new TaskQueue();
      const updated = taskQueue.updateStatus('task-1', 'failed', { error: 'Network error' });

      expect(updated!.status).toBe('failed');
      expect(updated!.error).toBe('Network error');
    });

    it('should update progress', () => {
      const row = taskRow({ id: 'task-1', status: 'running', progress: 50 });
      setupPrepare('SELECT * FROM tasks', row);

      const taskQueue = new TaskQueue();
      const updated = taskQueue.updateStatus('task-1', 'running', { progress: 50 });

      expect(updated!.progress).toBe(50);
    });

    it('should set deferred with scheduled_at + 1 minute', () => {
      const row = taskRow({ id: 'task-1', status: 'deferred', scheduled_at: Date.now() + 60000 });
      setupPrepare('SELECT * FROM tasks', row);

      const taskQueue = new TaskQueue();
      const before = Date.now();
      const updated = taskQueue.updateStatus('task-1', 'deferred');

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('deferred');
    });
  });

  describe('cancel()', () => {
    it('should cancel a pending task', () => {
      const row = taskRow({ id: 'task-1', status: 'cancelled' });
      setupPrepare('SELECT * FROM tasks', row);

      const taskQueue = new TaskQueue();
      const cancelled = taskQueue.cancel('task-1');

      expect(cancelled).not.toBeNull();
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should return null for non-existent task', () => {
      setupPrepare('SELECT * FROM tasks', null);

      const taskQueue = new TaskQueue();
      const result = taskQueue.cancel('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('dequeue()', () => {
    it('should return null when no pending tasks', () => {
      // First call: cleanupStaleTasks SELECT, Second call: UPDATE RETURNING
      mockDb.prepare.mockImplementation((s: string) => {
        if (s.includes('SELECT id FROM tasks') && s.includes('WHERE status =')) {
          return { all: vi.fn(() => []) }; // no stale tasks
        }
        if (s.includes('UPDATE tasks') && s.includes('RETURNING')) {
          return { get: vi.fn(() => undefined) }; // no task to dequeue
        }
        return { run: vi.fn(() => ({ changes: 0 })), get: vi.fn(() => null), all: vi.fn(() => []) };
      });

      const taskQueue = new TaskQueue();
      const result = taskQueue.dequeue();
      expect(result).toBeNull();
    });

    it('should return and update task to running', () => {
      const dequeueRow = taskRow({ id: 'task-1', status: 'running' });
      mockDb.prepare.mockImplementation((s: string) => {
        if (s.includes('SELECT id FROM tasks') && s.includes('WHERE status =')) {
          return { all: vi.fn(() => []) };
        }
        if (s.includes('UPDATE tasks') && s.includes('RETURNING')) {
          return { get: vi.fn(() => dequeueRow) };
        }
        return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => dequeueRow), all: vi.fn(() => []) };
      });

      const taskQueue = new TaskQueue();
      const dequeued = taskQueue.dequeue();

      expect(dequeued).not.toBeNull();
      expect(dequeued!.id).toBe('task-1');
      expect(dequeued!.status).toBe('running');
    });
  });

  describe('markFailed()', () => {
    it('should return null for non-existent task', () => {
      setupPrepare('SELECT * FROM tasks', null);

      const taskQueue = new TaskQueue();
      const result = taskQueue.markFailed('nonexistent', 'error');
      expect(result).toBeNull();
    });

    it('should defer task when retry count below max', () => {
      const taskRowPending = taskRow({ id: 'task-1', retry_count: 0, max_retries: 3, status: 'pending' });
      const taskRowDeferred = taskRow({ id: 'task-1', retry_count: 1, max_retries: 3, status: 'deferred', scheduled_at: Date.now() + 60000 });
      let callCount = 0;
      setupPrepare('SELECT * FROM tasks', null);
      mockDb.prepare.mockImplementation((s: string) => {
        if (s.includes('SELECT * FROM tasks WHERE id')) {
          callCount++;
          return {
            get: vi.fn(() => callCount === 1 ? taskRowPending : taskRowDeferred),
            run: vi.fn(() => ({ changes: 1 })),
          };
        }
        return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => null), all: vi.fn(() => []) };
      });

      const taskQueue = new TaskQueue();
      const result = taskQueue.markFailed('task-1', 'Network error');

      expect(result).not.toBeNull();
      expect(mockDb.prepare).toHaveBeenCalled();
      const updateCall = mockDb.prepare.mock.calls.find(([s]) => s.includes("status = 'deferred'"));
      expect(updateCall).toBeDefined();
    });

    it('should mark as failed when max retries exceeded', () => {
      const taskRowFailed = taskRow({ id: 'task-1', retry_count: 3, max_retries: 3, status: 'failed', error: '重试次数耗尽: Error' });
      let callCount = 0;
      setupPrepare('SELECT * FROM tasks', null);
      mockDb.prepare.mockImplementation((s: string) => {
        if (s.includes('SELECT * FROM tasks WHERE id')) {
          callCount++;
          return {
            get: vi.fn(() => callCount === 1 ? taskRow({ id: 'task-1', retry_count: 2, max_retries: 3, status: 'pending' }) : taskRowFailed),
            run: vi.fn(() => ({ changes: 1 })),
          };
        }
        return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => null), all: vi.fn(() => []) };
      });

      const taskQueue = new TaskQueue();
      const result = taskQueue.markFailed('task-1', 'Error');

      expect(result!.status).toBe('failed');
      expect(result!.error).toContain('重试次数耗尽');
    });
  });

  describe('checkpoint operations', () => {
    it('should save checkpoint', () => {
      const taskQueue = new TaskQueue();
      taskQueue.saveCheckpoint({
        taskId: 'task-1',
        step: 'login',
        payload: { username: 'test' },
        createdAt: Date.now(),
      });

      expect(mockDb.prepare).toHaveBeenCalled();
      const call = mockDb.prepare.mock.calls.find(([s]) => s.includes('INSERT OR REPLACE INTO task_checkpoints'));
      expect(call).toBeDefined();
    });

    it('should return checkpoint when found', () => {
      const cpRow = {
        task_id: 'task-1',
        step: 'login',
        payload: '{"username":"test"}',
        browser_state: null,
        created_at: Date.now(),
      };
      setupPrepare('SELECT * FROM task_checkpoints', cpRow);

      const taskQueue = new TaskQueue();
      const checkpoint = taskQueue.getCheckpoint('task-1');

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.step).toBe('login');
      expect(checkpoint!.payload).toEqual({ username: 'test' });
    });

    it('should return null when checkpoint not found', () => {
      setupPrepare('SELECT * FROM task_checkpoints', null);

      const taskQueue = new TaskQueue();
      const result = taskQueue.getCheckpoint('nonexistent');
      expect(result).toBeNull();
    });

    it('should clear checkpoint', () => {
      const taskQueue = new TaskQueue();
      taskQueue.clearCheckpoint('task-1');

      const call = mockDb.prepare.mock.calls.find(([s]) => s.includes('DELETE FROM task_checkpoints'));
      expect(call).toBeDefined();
    });
  });

  describe('getStats()', () => {
    it('should return zero stats for empty queue', () => {
      mockDb.prepare.mockImplementation((s: string) => {
        if (s.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ total: 0, pending: 0, running: 0, completed: 0, failed: 0, deferred: 0 })) };
        }
        return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => null), all: vi.fn(() => []) };
      });

      const taskQueue = new TaskQueue();
      const stats = taskQueue.getStats();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
    });

    it('should return correct stats counts', () => {
      mockDb.prepare.mockImplementation((s: string) => {
        if (s.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ total: 5, pending: 2, running: 1, completed: 1, failed: 1, deferred: 0 })) };
        }
        return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => null), all: vi.fn(() => []) };
      });

      const taskQueue = new TaskQueue();
      const stats = taskQueue.getStats();
      expect(stats.total).toBe(5);
      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe('cleanupStaleTasks()', () => {
    it('should find and mark stale running tasks as failed', () => {
      const staleTasks = [{ id: 'stale-1' }, { id: 'stale-2' }];
      mockDb.prepare.mockImplementation((s: string) => {
        if (s.includes('SELECT id FROM tasks') && s.includes('WHERE status =')) {
          return { all: vi.fn(() => staleTasks) };
        }
        if (s.includes('UPDATE tasks') && s.includes('status =')) {
          return { run: vi.fn(() => ({ changes: 1 })) };
        }
        return { run: vi.fn(() => ({ changes: 1 })), get: vi.fn(() => null), all: vi.fn(() => []) };
      });

      const taskQueue = new TaskQueue();
      taskQueue.cleanupStaleTasks();

      // Should call SELECT to find stale tasks
      const selectCall = mockDb.prepare.mock.calls.find(([s]) => s.includes('SELECT id FROM tasks'));
      expect(selectCall).toBeDefined();
      // Should call UPDATE to mark as failed (one per stale task)
      const updateCalls = mockDb.prepare.mock.calls.filter(([s]) => s.includes("status = 'failed'"));
      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });

  describe('updateField()', () => {
    it('should update ai_analysis_count field', () => {
      const updatedRow = taskRow({ id: 'task-1', ai_analysis_count: 3 });
      setupPrepare('SELECT * FROM tasks', updatedRow);

      const taskQueue = new TaskQueue();
      const result = taskQueue.updateField('task-1', 'ai_analysis_count', 3);

      expect(result).not.toBeNull();
      const updateCall = mockDb.prepare.mock.calls.find(([s]) => s.includes('ai_analysis_count ='));
      expect(updateCall).toBeDefined();
    });

    it('should return null for invalid field', () => {
      const taskQueue = new TaskQueue();
      const result = taskQueue.updateField('task-1', 'invalid_field', 1);
      expect(result).toBeNull();
    });

    it('should return null for non-existent task', () => {
      setupPrepare('SELECT * FROM tasks', null);

      const taskQueue = new TaskQueue();
      const result = taskQueue.updateField('nonexistent', 'ai_analysis_count', 1);
      expect(result).toBeNull();
    });
  });
});
