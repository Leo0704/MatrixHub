import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { getMaintenanceWindows, getErrorWeights, getTaskStaleTimeout } from './config/runtime-config.js';
import type { Task, TaskFilter, TaskStatus, TaskCheckpoint, Platform } from '../shared/types.js';
import { AppError, ErrorCode, ErrorType, classifyErrorCode, isAppError } from '../shared/errors.js';
import log from 'electron-log';
import type { TaskRow, TaskCheckpointRow } from './db-types.js';
import { asRow, asRows } from './db-types.js';
import { z } from 'zod';

// Payload Zod Schema — 只校验字段类型，不强制必填（向后兼容）
const publishPayloadSchema = z.object({
  accountId: z.string().optional(),
  title: z.string().optional(),
  content: z.union([z.string(), z.undefined()]),  // 可选但若存在须为 string
  contentType: z.enum(['image', 'video']).optional(),
  images: z.array(z.string()).optional(),
  video: z.string().optional(),
  voiceBase64: z.string().optional(),
});
type ValidatedPublishPayload = z.infer<typeof publishPayloadSchema>;

export class TaskQueue {
  // 失败回调注册表（解循环依赖：queue 不直接 import ai-director）
  private failureCallbacks: Array<(task: Task) => void> = [];

  /** 注册失败回调（供 ai-director 等模块调用） */
  onFailure(callback: (task: Task) => void): void {
    this.failureCallbacks.push(callback);
  }

  private emitFailure(task: Task): void {
    for (const cb of this.failureCallbacks) {
      try { cb(task); } catch (e) { log.warn('[Queue] failure callback error:', e); }
    }
  }
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
    pipelineId?: string;
  }): Task {
    // Zod Schema 校验 — publish 类型字段类型验证（松散模式，向后兼容）
    if (params.type === 'publish') {
      const result = publishPayloadSchema.safeParse(params.payload);
      if (!result.success) {
        // 只记录警告，不阻断创建（向后兼容旧数据）
        log.warn(`[Queue] payload 类型警告: ${result.error.message}`);
      }
    }

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
      pipelineId: params.pipelineId,
    };

    const stmt = db.prepare(`
      INSERT INTO tasks (id, type, platform, status, title, payload, max_retries, scheduled_at, created_at, updated_at, version, pipeline_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      task.version,
      task.pipelineId ?? null,
    );

    log.info(`任务创建: ${task.id} [${task.platform}] ${task.title}`);
    return task;
  }

  /**
   * 获取任务
   */
  get(taskId: string): Task | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    return row ? this.rowToTask(asRow<TaskRow>(row)) : null;
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
    `).all(...values, limit, offset);

    return asRows<TaskRow>(rows).map(r => this.rowToTask(r));
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
    // 注意：维护窗口检测在 SQL 层面做（见下文），这里先尝试出队
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
    `).get(now, now) as TaskRow | undefined;

    if (!row) return null;

    const task = this.rowToTask(row);

    // 维护窗口检查：处于维护窗口的平台不执行任务，直接放回队列
    const maintenanceDelay = this.getMaintenanceDelay(task.platform);
    if (maintenanceDelay > 0) {
      log.info(`[Queue] ${task.platform} 处于维护窗口，跳过任务 ${task.id}，延迟 ${maintenanceDelay}ms`);
      // 将任务重新放回 deferred 队列
      this.updateStatus(task.id, 'deferred');
      return null;
    }

    return task;
  }

  /**
   * 清理卡住的任务
   * 将运行超时的任务标记为失败
   */
  cleanupStaleTasks(): void {
    const db = getDb();
    const now = Date.now();
    const staleThreshold = now - getTaskStaleTimeout();

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
  markFailed(taskId: string, error: Error | AppError): Task | null {
    const db = getDb();
    const task = this.get(taskId);
    if (!task) return null;

    const retryCount = task.retryCount + 1;
    const errorMessage = error.message;

    if (retryCount >= task.maxRetries) {
      log.warn(`任务 ${taskId} 已达最大重试次数 (${task.maxRetries})`);
      // 通过注册回调触发 AI 分析（解循环依赖）
      this.emitFailure(task);
      return this.updateStatus(taskId, 'failed', { error: `重试次数耗尽: ${errorMessage}` });
    }

    const now = Date.now();

    // 分析错误类型
    const errorType = this.classifyError(error);
    const errorWeights = getErrorWeights();
    const errorInfo = errorWeights[errorType] || errorWeights.unknown;

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
    `).run(errorMessage, retryCount, now + finalDelay, now, taskId);

    log.info(`任务 ${taskId} 失败 [${errorType}]，` +
      `将于 ${Math.round(finalDelay)}ms 后重试 (${retryCount}/${task.maxRetries})`);
    return this.get(taskId);
  }

  /**
   * 分类错误类型
   */
  private classifyError(error: Error | AppError): ErrorType {
    if (isAppError(error)) {
      return classifyErrorCode(error.code);
    }

    // Fallback to string matching for non-AppError
    const message = error?.message?.toLowerCase() || '';
    if (message.includes('rate') || message.includes('限流') || message.includes('频率')) {
      return ErrorType.RATE_LIMIT;
    }
    if (message.includes('network') || message.includes('网络') || message.includes('fetch')) {
      return ErrorType.NETWORK;
    }
    if (message.includes('login') || message.includes('登录') || message.includes('session')) {
      return ErrorType.LOGIN;
    }
    if (message.includes('timeout') || message.includes('超时')) {
      return ErrorType.TIMEOUT;
    }
    return ErrorType.UNKNOWN;
  }

  /**
   * 获取平台维护窗口延迟（返回需要等待的毫秒数，0 表示不在维护窗口）
   */
  private getMaintenanceDelay(platform: Platform): number {
    const maintenanceWindows = getMaintenanceWindows();
    const windows = maintenanceWindows[platform];
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
    const row = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ?').get(taskId);
    if (!row) return null;
    const checkpointRow = asRow<TaskCheckpointRow>(row);

    // 检查点过期时间：24小时
    const CHECKPOINT_EXPIRY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (now - checkpointRow.created_at > CHECKPOINT_EXPIRY_MS) {
      // 检查点已过期，清除并返回 null
      log.warn(`检查点已过期: ${taskId} (${new Date(checkpointRow.created_at).toISOString()})`);
      this.clearCheckpoint(taskId);
      return null;
    }

    return {
      taskId: checkpointRow.task_id,
      step: checkpointRow.step,
      payload: JSON.parse(checkpointRow.payload),
      browserState: checkpointRow.browser_state ?? undefined,
      createdAt: checkpointRow.created_at,
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
    `).get();

    return {
      total: (row as { total: number }).total ?? 0,
      pending: (row as { pending: number }).pending ?? 0,
      running: (row as { running: number }).running ?? 0,
      completed: (row as { completed: number }).completed ?? 0,
      failed: (row as { failed: number }).failed ?? 0,
      deferred: (row as { deferred: number }).deferred ?? 0,
    };
  }

  private rowToTask(row: TaskRow): Task {
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
