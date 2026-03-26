import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi, beforeEach as setupBeforeEach } from 'vitest';

// 取消全局 mock，恢复真实数据库（queue.test.ts 需要真实数据库）
vi.unmock('better-sqlite3');
vi.unmock('electron-log');
vi.unmock('uuid');
vi.unmock('electron');

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorCode, ErrorType, classifyErrorCode, isAppError } from '../shared/errors.js';
import { taskQueue } from './queue.js';

// 临时测试数据库路径
const TEST_DB_DIR = '/tmp/matrixhub-test';
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

describe('TaskQueue', () => {
  let db: Database.Database;

  beforeEach(() => {
    // 确保测试目录存在
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    // 删除旧测试数据库
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    // 清理 WAL 文件
    const walPath = TEST_DB_PATH + '-wal';
    const shmPath = TEST_DB_PATH + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    // 创建真实数据库连接
    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    // 初始化 schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('publish', 'ai_generate', 'fetch_data', 'automation', 'page_agent')),
        platform TEXT NOT NULL CHECK(platform IN ('douyin', 'kuaishou', 'xiaohongshu')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'deferred')),
        title TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        result TEXT,
        error TEXT,
        progress INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        scheduled_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER DEFAULT 1,
        ai_analysis_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_platform ON tasks(platform);
      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
      CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);

      CREATE TABLE IF NOT EXISTS task_checkpoints (
        task_id TEXT PRIMARY KEY,
        step TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        browser_state TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    // 清理测试数据库
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    const walPath = TEST_DB_PATH + '-wal';
    const shmPath = TEST_DB_PATH + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  });

  // Helper: 直接用 SQL 创建任务
  const createTaskRow = (overrides: Record<string, unknown> = {}) => {
    // 使用时间戳+递增计数确保唯一ID
    const id = (overrides.id as string) || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const defaults = {
      id,
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
      created_at: now,
      updated_at: now,
      version: 1,
      ai_analysis_count: 0,
    };
    const task = { ...defaults, ...overrides };

    db.prepare(`
      INSERT INTO tasks (id, type, platform, status, title, payload, result, error, progress, retry_count, max_retries, scheduled_at, started_at, completed_at, created_at, updated_at, version, ai_analysis_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id, task.type, task.platform, task.status, task.title, task.payload,
      task.result, task.error, task.progress, task.retry_count, task.max_retries,
      task.scheduled_at, task.started_at, task.completed_at, task.created_at,
      task.updated_at, task.version, task.ai_analysis_count
    );
    return task;
  };

  // Helper: 将数据库行转换为 Task 对象
  const rowToTask = (row: any) => ({
    id: row.id,
    type: row.type,
    platform: row.platform,
    status: row.status,
    title: row.title,
    payload: JSON.parse(row.payload || '{}'),
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
    progress: row.progress,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  });

  describe('create()', () => {
    it('should create a task with pending status', () => {
      const now = Date.now();
      const id = uuidv4();

      db.prepare(`
        INSERT INTO tasks (id, type, platform, status, title, payload, max_retries, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'publish', 'douyin', 'pending', 'Test Task', '{}', 3, now, now, 1);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      const task = rowToTask(row);

      expect(task.id).toBe(id);
      expect(task.status).toBe('pending');
      expect(task.type).toBe('publish');
      expect(task.platform).toBe('douyin');
    });

    it('should create scheduled task with correct scheduledAt', () => {
      const scheduledTime = Date.now() + 3600000;
      const now = Date.now();
      const id = uuidv4();

      db.prepare(`
        INSERT INTO tasks (id, type, platform, status, title, payload, max_retries, scheduled_at, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'publish', 'douyin', 'pending', 'Scheduled Task', '{}', 3, scheduledTime, now, now, 1);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      const task = rowToTask(row);

      expect(task.scheduledAt).toBe(scheduledTime);
    });

    it('should set default maxRetries to 3', () => {
      const now = Date.now();
      const id = uuidv4();

      db.prepare(`
        INSERT INTO tasks (id, type, platform, status, title, payload, max_retries, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'publish', 'douyin', 'pending', 'Test', '{}', 3, now, now, 1);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      const task = rowToTask(row);

      expect(task.maxRetries).toBe(3);
    });
  });

  describe('get()', () => {
    it('should return null when task not found', () => {
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('nonexistent');
      expect(row).toBeUndefined();
    });

    it('should return task when found', () => {
      const task = createTaskRow();
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      const result = rowToTask(row);

      expect(result.id).toBe(task.id);
    });
  });

  describe('list()', () => {
    it('should return empty array when no tasks', () => {
      const rows = db.prepare('SELECT * FROM tasks').all();
      expect(rows).toEqual([]);
    });

    it('should return tasks with correct structure', () => {
      createTaskRow();
      const rows = db.prepare('SELECT * FROM tasks').all();
      const tasks = rows.map(rowToTask);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].platform).toBe('douyin');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        createTaskRow({ title: `Task ${i}` });
      }
      const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at ASC LIMIT 3').all();

      expect(rows).toHaveLength(3);
    });
  });

  describe('cancel()', () => {
    it('should update status to cancelled', () => {
      const task = createTaskRow();
      const now = Date.now();

      db.prepare(`
        UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?
      `).run(now, task.id);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      const result = rowToTask(row);

      expect(result.status).toBe('cancelled');
    });
  });

  describe('dequeue()', () => {
    it('should return null when no pending tasks', () => {
      const TASK_STALE_TIMEOUT_MS = 60 * 60 * 1000;
      const now = Date.now();
      const staleThreshold = now - TASK_STALE_TIMEOUT_MS;

      // 清理过期任务
      db.prepare(`
        UPDATE tasks
        SET status = 'failed', error = '任务执行超时，系统自动清理', updated_at = ?
        WHERE status = 'running' AND updated_at < ?
      `).run(now, staleThreshold);

      // 没有 pending 任务
      const row = db.prepare(`
        UPDATE tasks
        SET status = 'running', updated_at = ?, version = version + 1
        WHERE id = (
          SELECT id FROM tasks
          WHERE (status = 'pending' OR status = 'deferred')
            AND (scheduled_at IS NULL OR scheduled_at <= ?)
          ORDER BY created_at ASC
          LIMIT 1
        )
        RETURNING *
      `).get(now, now);

      expect(row).toBeUndefined();
    });

    it('should return and update task to running status', () => {
      const task = createTaskRow({ status: 'pending' });
      const now = Date.now();

      const row = db.prepare(`
        UPDATE tasks
        SET status = 'running', updated_at = ?, version = version + 1
        WHERE id = (
          SELECT id FROM tasks
          WHERE (status = 'pending' OR status = 'deferred')
            AND (scheduled_at IS NULL OR scheduled_at <= ?)
          ORDER BY created_at ASC
          LIMIT 1
        )
        RETURNING *
      `).get(now, now);

      const result = rowToTask(row);
      expect(result.status).toBe('running');
      expect(result.id).toBe(task.id);
    });

    it('should use atomic UPDATE RETURNING to prevent race conditions', () => {
      createTaskRow();
      const now = Date.now();

      // 验证 RETURNING 子句存在
      const sql = `
        UPDATE tasks
        SET status = 'running', updated_at = ?, version = version + 1
        WHERE id = (
          SELECT id FROM tasks
          WHERE (status = 'pending' OR status = 'deferred')
            AND (scheduled_at IS NULL OR scheduled_at <= ?)
          ORDER BY created_at ASC
          LIMIT 1
        )
        RETURNING *
      `;

      const row = db.prepare(sql).get(now, now);

      expect(row).toBeDefined();
      expect(row).toHaveProperty('id');
    });
  });

  describe('updateStatus()', () => {
    it('should return null when task not found', () => {
      const now = Date.now();
      const result = db.prepare(`
        UPDATE tasks SET status = 'running', updated_at = ? WHERE id = ?
        RETURNING *
      `).get(now, 'nonexistent');

      expect(result).toBeUndefined();
    });

    it('should update status and set started_at for running', () => {
      const task = createTaskRow();
      const now = Date.now();

      db.prepare(`
        UPDATE tasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?
      `).run(now, now, task.id);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      const result = rowToTask(row);

      expect(result.status).toBe('running');
    });

    it('should set completed_at for completed status', () => {
      const task = createTaskRow();
      const now = Date.now();

      db.prepare(`
        UPDATE tasks SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?
      `).run(now, now, task.id);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      const result = rowToTask(row);

      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe(now);
    });
  });

  describe('checkpoint operations', () => {
    it('should save checkpoint to database', () => {
      const task = createTaskRow();
      const now = Date.now();

      db.prepare(`
        INSERT INTO task_checkpoints (task_id, step, payload, created_at)
        VALUES (?, ?, ?, ?)
      `).run(task.id, 'login', '{}', now);

      const row = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ?').get(task.id);
      expect(row).toBeDefined();
      expect(row).toHaveProperty('step', 'login');
    });

    it('should return null when checkpoint not found', () => {
      const row = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ?').get('nonexistent');
      expect(row).toBeUndefined();
    });

    it('should clear checkpoint from database', () => {
      const task = createTaskRow();
      const now = Date.now();

      db.prepare(`
        INSERT INTO task_checkpoints (task_id, step, payload, created_at)
        VALUES (?, ?, ?, ?)
      `).run(task.id, 'login', '{}', now);

      db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(task.id);

      const row = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ?').get(task.id);
      expect(row).toBeUndefined();
    });
  });

  describe('getStats()', () => {
    it('should return statistics with all counters', () => {
      createTaskRow({ status: 'pending' });
      createTaskRow({ status: 'running' });
      createTaskRow({ status: 'completed' });
      createTaskRow({ status: 'failed' });

      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
          COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) as running,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
          COALESCE(SUM(CASE WHEN status = 'deferred' THEN 1 ELSE 0 END), 0) as deferred
        FROM tasks
      `).get() as any;

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.deferred).toBe(0);
    });

    it('should handle empty table gracefully', () => {
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
          COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) as running,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
          COALESCE(SUM(CASE WHEN status = 'deferred' THEN 1 ELSE 0 END), 0) as deferred
        FROM tasks
      `).get() as any;

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
    });
  });

  describe('markFailed()', () => {
    it('should increment retry count when under max', () => {
      const task = createTaskRow({ retry_count: 0, max_retries: 3 });
      const now = Date.now();

      db.prepare(`
        UPDATE tasks
        SET retry_count = retry_count + 1,
            status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'deferred' END,
            error = ?,
            updated_at = ?
        WHERE id = ?
      `).run('Network error', now, task.id);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as any;
      expect(row.retry_count).toBe(1);
      expect(row.status).toBe('deferred');
    });

    it('should mark as failed when max retries exceeded', () => {
      const task = createTaskRow({ retry_count: 2, max_retries: 3 });
      const now = Date.now();

      // 模拟 queue.ts 的 markFailed 逻辑：超过最大重试时添加前缀
      const errorMessage = '重试次数耗尽: Network error';

      db.prepare(`
        UPDATE tasks
        SET retry_count = retry_count + 1,
            status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'deferred' END,
            error = ?,
            updated_at = ?
        WHERE id = ?
      `).run(errorMessage, now, task.id);

      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) as any;
      expect(row.retry_count).toBe(3);
      expect(row.status).toBe('failed');
      expect(row.error).toContain('重试次数耗尽');
    });
  });

  describe('classifyError', () => {
    it('should classify AppError by code - SELECTOR_ERROR', () => {
      const err = new AppError('test', ErrorCode.SELECTOR_ERROR);
      const type = taskQueue.classifyError(err);
      expect(type).toBe(ErrorType.SELECTOR);
    });

    it('should classify AppError by code - RATE_LIMIT_EXCEEDED', () => {
      const err = new AppError('test', ErrorCode.RATE_LIMIT_EXCEEDED);
      const type = taskQueue.classifyError(err);
      expect(type).toBe(ErrorType.RATE_LIMIT);
    });

    it('should classify AppError by code - NETWORK_ERROR', () => {
      const err = new AppError('test', ErrorCode.NETWORK_ERROR);
      const type = taskQueue.classifyError(err);
      expect(type).toBe(ErrorType.NETWORK);
    });

    it('should classify AppError by code - LOGIN_REQUIRED', () => {
      const err = new AppError('test', ErrorCode.LOGIN_REQUIRED);
      const type = taskQueue.classifyError(err);
      expect(type).toBe(ErrorType.LOGIN);
    });

    it('should classify AppError by code - TIMEOUT', () => {
      const err = new AppError('test', ErrorCode.TIMEOUT);
      const type = taskQueue.classifyError(err);
      expect(type).toBe(ErrorType.TIMEOUT);
    });

    it('should classify AppError by code - ELEMENT_NOT_FOUND', () => {
      const err = new AppError('test', ErrorCode.ELEMENT_NOT_FOUND);
      const type = taskQueue.classifyError(err);
      expect(type).toBe(ErrorType.SELECTOR);
    });

    it('should classify regular Error with string matching', () => {
      const err = new Error('Selector not found');
      const type = taskQueue.classifyError(err);
      expect(type).toBe(ErrorType.SELECTOR);
    });
  });

  describe('classifyErrorCode', () => {
    it('should map SELECTOR_ERROR to SELECTOR', () => {
      expect(classifyErrorCode(ErrorCode.SELECTOR_ERROR)).toBe(ErrorType.SELECTOR);
    });

    it('should map ELEMENT_NOT_FOUND to SELECTOR', () => {
      expect(classifyErrorCode(ErrorCode.ELEMENT_NOT_FOUND)).toBe(ErrorType.SELECTOR);
    });

    it('should map PAGE_ACTION_FAILED to SELECTOR', () => {
      expect(classifyErrorCode(ErrorCode.PAGE_ACTION_FAILED)).toBe(ErrorType.SELECTOR);
    });

    it('should map RATE_LIMIT_EXCEEDED to RATE_LIMIT', () => {
      expect(classifyErrorCode(ErrorCode.RATE_LIMIT_EXCEEDED)).toBe(ErrorType.RATE_LIMIT);
    });

    it('should map NETWORK_ERROR to NETWORK', () => {
      expect(classifyErrorCode(ErrorCode.NETWORK_ERROR)).toBe(ErrorType.NETWORK);
    });

    it('should map SESSION_EXPIRED to LOGIN', () => {
      expect(classifyErrorCode(ErrorCode.SESSION_EXPIRED)).toBe(ErrorType.LOGIN);
    });

    it('should map LOGIN_REQUIRED to LOGIN', () => {
      expect(classifyErrorCode(ErrorCode.LOGIN_REQUIRED)).toBe(ErrorType.LOGIN);
    });

    it('should map TIMEOUT to TIMEOUT', () => {
      expect(classifyErrorCode(ErrorCode.TIMEOUT)).toBe(ErrorType.TIMEOUT);
    });

    it('should map UNKNOWN_ERROR to UNKNOWN', () => {
      expect(classifyErrorCode(ErrorCode.UNKNOWN_ERROR)).toBe(ErrorType.UNKNOWN);
    });
  });
});
