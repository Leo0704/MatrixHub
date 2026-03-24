import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import type { Task, TaskFilter, TaskStatus, TaskCheckpoint, Platform } from '../shared/types.js';
import log from 'electron-log';

// 平台维护窗口（北京时间）- 这些时段容易失败
const PLATFORM_MAINTENANCE_WINDOWS: Record<Platform, { start: number; end: number; reason?: string }[]> = {
  douyin: [
    { start: 3, end: 5, reason: '抖音日常维护' },
    { start: 23, end: 24, reason: '日结时段' },
  ],
  kuaishou: [
    { start: 2, end: 4, reason: '快手日常维护' },
    { start: 23, end: 24, reason: '日结时段' },
  ],
  xiaohongshu: [
    { start: 2, end: 6, reason: '小红书日常维护' },
    { start: 22, end: 24, reason: '晚高峰限流' },
  ],
};

// 错误类型对应的权重
const ERROR_WEIGHTS: Record<string, { weight: number; waitMultiplier: number }> = {
  'selector': { weight: 0.3, waitMultiplier: 1.0 },      // 选择器问题，快速重试
  'rate_limit': { weight: 0.8, waitMultiplier: 3.0 },   // 限流，增加等待
  'network': { weight: 0.5, waitMultiplier: 1.5 },     // 网络问题
  'login': { weight: 0.9, waitMultiplier: 5.0 },       // 登录问题，大幅等待
  'timeout': { weight: 0.4, waitMultiplier: 1.2 },     // 超时问题
  'unknown': { weight: 0.5, waitMultiplier: 1.0 },      // 未知问题
};

// 任务超时时间：运行超过1小时认为是卡住了
const TASK_STALE_TIMEOUT_MS = 60 * 60 * 1000;

export class TaskQueue {
  /**
   * 创建新任务
   */
  create(params: {
    type: Task['type'];
    platform: Task['platform'];
    title: string;
    payload: Record<string, unknown>;
    scheduledAt?: number;
    maxRetries?: number;
  }): Task {
    const db = getDb();
    const now = Date.now();
    const task: Task = {
      id: uuidv4(),
      type: params.type,
      platform: params.platform,
      status: 'pending',
      title: params.title,
      payload: params.payload,
      retryCount: 0,
      maxRetries: params.maxRetries ?? 3,
      scheduledAt: params.scheduledAt,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const stmt = db.prepare(`
      INSERT INTO tasks (id, type, platform, status, title, payload, max_retries, scheduled_at, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.type,
      task.platform,
      task.status,
      task.title,
      JSON.stringify(task.payload),
      task.maxRetries,
      task.scheduledAt ?? null,
      task.createdAt,
      task.updatedAt,
      task.version
    );

    log.info(`任务创建: ${task.id} [${task.platform}] ${task.title}`);
    return task;
  }

  /**
   * 获取任务
   */
  get(taskId: string): Task | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    return row ? this.rowToTask(row) : null;
  }

  /**
   * 查询任务列表
   */
  list(filter: TaskFilter = {}): Task[] {
    const db = getDb();
    const conditions: string[] = [];
    const values: any[] = [];

    if (filter.status?.length) {
      conditions.push(`status IN (${filter.status.map(() => '?').join(',')})`);
      values.push(...filter.status);
    }
    if (filter.type) {
      conditions.push('type = ?');
      values.push(filter.type);
    }
    if (filter.platform) {
      conditions.push('platform = ?');
      values.push(filter.platform);
    }
    if (filter.from) {
      conditions.push('created_at >= ?');
      values.push(filter.from);
    }
    if (filter.to) {
      conditions.push('created_at <= ?');
      values.push(filter.to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = db.prepare(`
      SELECT * FROM tasks ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...values, limit, offset) as any[];

    return rows.map(r => this.rowToTask(r));
  }

  /**
   * 获取下一个待执行任务（原子性出队，防止竞态条件）
   * 使用 UPDATE ... RETURNING 确保任务只被一个 worker 拾取
   */
  dequeue(): Task | null {
    const db = getDb();
    const now = Date.now();

    // 首先清理卡住的任务（运行超时）
    this.cleanupStaleTasks();

    // 原子性：SELECT + UPDATE status = 'running' 在同一个语句中
    // 这防止了多个 worker 同时获取同一个任务的问题
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
    `).get(now, now) as any;

    if (row) {
      return this.rowToTask(row);
    }
    return null;
  }

  /**
   * 清理卡住的任务
   * 将运行超时（超过 TASK_STALE_TIMEOUT_MS）的任务标记为失败
   */
  cleanupStaleTasks(): void {
    const db = getDb();
    const now = Date.now();
    const staleThreshold = now - TASK_STALE_TIMEOUT_MS;

    // 查找运行超时且未更新的任务
    const staleTasks = db.prepare(`
      SELECT id FROM tasks
      WHERE status = 'running'
        AND updated_at < ?
    `).all(staleThreshold) as { id: string }[];

    if (staleTasks.length > 0) {
      log.warn(`发现 ${staleTasks.length} 个卡住的任务，将标记为失败`);
      for (const task of staleTasks) {
        db.prepare(`
          UPDATE tasks
          SET status = 'failed',
              error = '任务执行超时，系统自动清理',
              updated_at = ?
          WHERE id = ? AND status = 'running'
        `).run(now, task.id);

        // 清除相关检查点
        this.clearCheckpoint(task.id);

        log.info(`任务已超时标记失败: ${task.id}`);
      }
    }
  }

  /**
   * 更新任务状态
   */
  updateStatus(
    taskId: string,
    status: TaskStatus,
    extra?: {
      result?: Record<string, unknown>;
      error?: string;
      progress?: number;
    }
  ): Task | null {
    const db = getDb();
    const now = Date.now();
    const task = this.get(taskId);
    if (!task) return null;

    const updates: string[] = ['status = ?', 'updated_at = ?', 'version = version + 1'];
    const values: any[] = [status, now];

    if (extra?.result !== undefined) {
      updates.push('result = ?');
      values.push(JSON.stringify(extra.result));
    }
    if (extra?.error !== undefined) {
      updates.push('error = ?');
      values.push(extra.error);
    }
    if (extra?.progress !== undefined) {
      updates.push('progress = ?');
      values.push(extra.progress);
    }
    if (status === 'running') {
      updates.push('started_at = ?');
      values.push(now);
    }
    if (status === 'completed' || status === 'failed') {
      updates.push('completed_at = ?');
      values.push(now);
    }
    if (status === 'deferred') {
      // 延迟任务自动设置 1 分钟后再试
      updates.push('scheduled_at = ?');
      values.push(now + 60000);
    }

    values.push(taskId);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    log.info(`任务状态更新: ${taskId} → ${status}`);
    return this.get(taskId);
  }

  /**
   * 标记任务失败并增加重试计数（智能重试）
   */
  markFailed(taskId: string, error: string): Task | null {
    const db = getDb();
    const task = this.get(taskId);
    if (!task) return null;

    const retryCount = task.retryCount + 1;

    if (retryCount >= task.maxRetries) {
      log.warn(`任务 ${taskId} 已达最大重试次数 (${task.maxRetries})`);
      // 触发 AI 分析（异步，不阻塞返回）
      // 注意：使用动态 import 避免循环依赖
      import('./ai-director.js').then(({ analyzeFailure }) => {
        analyzeFailure(task).catch(err => {
          log.error('[Queue] AI分析调用失败:', err)
        })
      }).catch(err => {
        log.error('[Queue] 加载ai-director失败:', err)
      })
      return this.updateStatus(taskId, 'failed', { error: `重试次数耗尽: ${error}` });
    }

    const now = Date.now();

    // 分析错误类型
    const errorType = this.classifyError(error);
    const errorInfo = ERROR_WEIGHTS[errorType] || ERROR_WEIGHTS.unknown;

    // 检查是否在维护窗口
    const maintenanceDelay = this.getMaintenanceDelay(task.platform);
    const isMaintenanceWindow = maintenanceDelay > 0;

    // 计算智能退避延迟
    // 基础延迟：指数退避，但根据错误类型调整
    const baseDelay = Math.min(60000 * Math.pow(2, retryCount - 1), 300000);
    const adjustedDelay = baseDelay * errorInfo.waitMultiplier;

    // 如果在维护窗口，等待到维护结束 + 随机额外时间
    let finalDelay: number;
    if (isMaintenanceWindow) {
      const waitUntilMaintenanceEnd = maintenanceDelay + Math.random() * 60000;
      finalDelay = Math.max(adjustedDelay, waitUntilMaintenanceEnd);
      log.info(`[Queue] 检测到 ${task.platform} 维护窗口，等待 ${maintenanceDelay}ms + 额外 ${Math.round(finalDelay - maintenanceDelay)}ms`);
    } else {
      // 添加抖动（±20%）避免所有任务同时重试
      finalDelay = adjustedDelay * (0.8 + Math.random() * 0.4);
    }

    db.prepare(`
      UPDATE tasks SET
        status = 'deferred',
        error = ?,
        retry_count = ?,
        scheduled_at = ?,
        updated_at = ?,
        version = version + 1
      WHERE id = ?
    `).run(error, retryCount, now + finalDelay, now, taskId);

    log.info(`任务 ${taskId} 失败 [${errorType}]，` +
      `将于 ${Math.round(finalDelay)}ms 后重试 (${retryCount}/${task.maxRetries})`);
    return this.get(taskId);
  }

  /**
   * 分类错误类型
   */
  private classifyError(error: string): string {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('selector') || lowerError.includes('元素未找到') || lowerError.includes('找不到')) {
      return 'selector';
    }
    if (lowerError.includes('rate') || lowerError.includes('限流') || lowerError.includes('频繁')) {
      return 'rate_limit';
    }
    if (lowerError.includes('network') || lowerError.includes('网络') || lowerError.includes('连接')) {
      return 'network';
    }
    if (lowerError.includes('login') || lowerError.includes('登录') || lowerError.includes('未登录') || lowerError.includes('session')) {
      return 'login';
    }
    if (lowerError.includes('timeout') || lowerError.includes('超时')) {
      return 'timeout';
    }

    return 'unknown';
  }

  /**
   * 获取平台维护窗口延迟（返回需要等待的毫秒数，0 表示不在维护窗口）
   */
  private getMaintenanceDelay(platform: Platform): number {
    const windows = PLATFORM_MAINTENANCE_WINDOWS[platform];
    if (!windows) return 0;

    // 转换为北京时间
    const now = new Date();
    const beijingHour = (now.getUTCHours() + 8) % 24;

    for (const window of windows) {
      if (window.start <= window.end) {
        // 正常区间，如 3:00-5:00
        if (beijingHour >= window.start && beijingHour < window.end) {
          // 计算距离窗口结束还有多久
          return (window.end - beijingHour) * 60 * 60 * 1000;
        }
      } else {
        // 跨天区间，如 23:00-24:00
        if (beijingHour >= window.start || beijingHour < window.end) {
          if (beijingHour >= window.start) {
            // end=24 表示到午夜(0点)，即 24 - beijingHour
            const endHours = window.end === 24 ? 0 : window.end;
            return (24 - beijingHour + endHours) * 60 * 60 * 1000;
          } else {
            return (window.end - beijingHour) * 60 * 60 * 1000;
          }
        }
      }
    }

    return 0;
  }

  /**
   * 取消任务
   */
  cancel(taskId: string): Task | null {
    return this.updateStatus(taskId, 'cancelled');
  }

  /**
   * 保存检查点
   */
  saveCheckpoint(checkpoint: TaskCheckpoint): void {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO task_checkpoints (task_id, step, payload, browser_state, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      checkpoint.taskId,
      checkpoint.step,
      JSON.stringify(checkpoint.payload),
      checkpoint.browserState ?? null,
      checkpoint.createdAt
    );
    log.debug(`检查点保存: ${checkpoint.taskId} @ ${checkpoint.step}`);
  }

  /**
   * 获取检查点
   * 如果检查点超过24小时，认为已过期并清除
   */
  getCheckpoint(taskId: string): TaskCheckpoint | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ?').get(taskId) as any;
    if (!row) return null;

    // 检查点过期时间：24小时
    const CHECKPOINT_EXPIRY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (now - row.created_at > CHECKPOINT_EXPIRY_MS) {
      // 检查点已过期，清除并返回 null
      log.warn(`检查点已过期: ${taskId} (${new Date(row.created_at).toISOString()})`);
      this.clearCheckpoint(taskId);
      return null;
    }

    return {
      taskId: row.task_id,
      step: row.step,
      payload: JSON.parse(row.payload),
      browserState: row.browser_state ?? undefined,
      createdAt: row.created_at,
    };
  }

  /**
   * 删除检查点
   */
  clearCheckpoint(taskId: string): void {
    const db = getDb();
    db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(taskId);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    deferred: number;
  } {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'deferred' THEN 1 ELSE 0 END) as deferred
      FROM tasks
    `).get() as any;

    return {
      total: row.total ?? 0,
      pending: row.pending ?? 0,
      running: row.running ?? 0,
      completed: row.completed ?? 0,
      failed: row.failed ?? 0,
      deferred: row.deferred ?? 0,
    };
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      type: row.type as Task['type'],
      platform: row.platform as Task['platform'],
      status: row.status as Task['status'],
      title: row.title,
      payload: JSON.parse(row.payload),
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ?? undefined,
      progress: row.progress ?? undefined,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      scheduledAt: row.scheduled_at ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  /**
   * 更新任务的任意字段（用于 AI 分析次数跟踪等）
   */
  updateField(taskId: string, field: string, value: unknown): Task | null {
    const db = getDb();
    const now = Date.now();
    const validFields = ['ai_analysis_count', 'version'];
    if (!validFields.includes(field)) {
      log.warn(`[TaskQueue] updateField: invalid field "${field}"`);
      return null;
    }
    const dbField = field === 'ai_analysis_count' ? 'ai_analysis_count' : field;
    db.prepare(`
      UPDATE tasks SET ${dbField} = ?, updated_at = ?, version = version + 1 WHERE id = ?
    `).run(value, now, taskId);
    return this.get(taskId);
  }
}

export const taskQueue = new TaskQueue();
