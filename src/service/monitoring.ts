import { getDb } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import type { Platform } from '../shared/types.js';
import { getBrowserPoolStatus, getPagePoolStatus } from './platform-launcher.js';
import { taskQueue } from './queue.js';
import type { AlertRow, MetricRow, TaskRow } from './db-types.js';
import { asRow, asRows } from './db-types.js';

// Alert thresholds
export const ALERT_THRESHOLDS = {
  publishSuccessRate: 0.8,    // < 80% 告警
  avgPublishDuration: 300000, // > 5分钟 告警
  aiLatency: 30000,          // > 30秒 告警
  accountHealth: 50,         // > 50分 告警
  browserCrashCount: 3,      // > 3次 告警
  queuePending: 50,           // > 50 告警
} as const;

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    browserPool: boolean;
    aiGateway: boolean;
    database: boolean;
    queue: boolean;
  };
  metrics: {
    activeBrowsers: number;
    pendingTasks: number;
    failedTasks24h: number;
    avgAiLatency: number;
  };
  timestamp: number;
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
  metricName?: string;
  metricValue?: number;
}

export interface Metric {
  id: string;
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

/**
 * 监控系统
 * - 健康检查
 * - 指标收集
 * - 告警通知
 */
export class MonitoringService {
  private browserCrashCount = 0;
  private aiLatencies: number[] = [];
  private lastHealthCheck = 0;
  private healthCheckInterval = 5 * 60 * 1000; // 5分钟
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  constructor() {
    // Schedule periodic health check
    this.scheduleHealthCheck();
  }

  /**
   * 停止监控服务（清理定时器）
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<HealthStatus> {
    const db = getDb();
    const now = Date.now();

    // Check database
    let dbHealthy = false;
    try {
      db.prepare('SELECT 1').get();
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    // Get queue stats
    const queueStats = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' OR status = 'deferred' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'failed' AND updated_at > ? THEN 1 ELSE 0 END) as failed_24h
      FROM tasks
    `).get(now - 24 * 60 * 60 * 1000) as { pending: number; failed_24h: number } | undefined;

    // Check alerts
    const recentAlerts = db.prepare(`
      SELECT COUNT(*) as count FROM alerts
      WHERE timestamp > ? AND acknowledged = 0
    `).get(now - 60 * 60 * 1000) as { count: number } | undefined;

    const pendingTasks = queueStats?.pending ?? 0;
    const queueHealthy = pendingTasks < ALERT_THRESHOLDS.queuePending;

    const failedTasks24h = queueStats?.failed_24h ?? 0;

    // Calculate avg AI latency
    const avgAiLatency = this.aiLatencies.length > 0
      ? this.aiLatencies.reduce((a, b) => a + b, 0) / this.aiLatencies.length
      : 0;

    // Get browser pool status
    const browserPoolStatus = getBrowserPoolStatus();
    const browserPoolHealthy = browserPoolStatus.activeBrowsers >= 0; // Browser pool is healthy if we can get its status

    // Determine overall status
    const checks = {
      browserPool: browserPoolHealthy,
      aiGateway: avgAiLatency < ALERT_THRESHOLDS.aiLatency || avgAiLatency === 0,
      database: dbHealthy,
      queue: queueHealthy,
    };

    const allHealthy = Object.values(checks).every(v => v === true);
    const anyUnhealthy = Object.values(checks).some(v => v === false);

    let status: HealthStatus['status'] = 'healthy';
    if (anyUnhealthy) status = 'degraded';
    if (!dbHealthy || pendingTasks > ALERT_THRESHOLDS.queuePending * 2) status = 'unhealthy';

    const healthStatus: HealthStatus = {
      status,
      checks,
      metrics: {
        activeBrowsers: browserPoolStatus.activeBrowsers,
        pendingTasks,
        failedTasks24h,
        avgAiLatency,
      },
      timestamp: now,
    };

    this.lastHealthCheck = now;

    // Check for alerts
    await this.checkAlerts(healthStatus);

    return healthStatus;
  }

  /**
   * 检查是否需要发送告警
   */
  private async checkAlerts(status: HealthStatus): Promise<void> {
    const alerts: { type: Alert['type']; title: string; message: string; metricName?: string; metricValue?: number }[] = [];

    // Check publish success rate
    if (status.metrics.failedTasks24h > 5) {
      const totalTasks = status.metrics.pendingTasks + status.metrics.failedTasks24h;
      const successRate = totalTasks > 0
        ? (totalTasks - status.metrics.failedTasks24h) / totalTasks
        : 1;

      if (successRate < ALERT_THRESHOLDS.publishSuccessRate) {
        alerts.push({
          type: 'warning',
          title: '发布成功率低',
          message: `最近24小时发布成功率为 ${(successRate * 100).toFixed(1)}%，低于 ${(ALERT_THRESHOLDS.publishSuccessRate * 100).toFixed(0)}% 阈值`,
          metricName: 'publish_success_rate',
          metricValue: successRate,
        });
      }
    }

    // Check AI latency
    if (status.metrics.avgAiLatency > ALERT_THRESHOLDS.aiLatency) {
      alerts.push({
        type: 'warning',
        title: 'AI 响应延迟高',
        message: `AI 请求平均响应时间为 ${(status.metrics.avgAiLatency / 1000).toFixed(1)}秒，超过 ${(ALERT_THRESHOLDS.aiLatency / 1000).toFixed(0)}秒 阈值`,
        metricName: 'ai_avg_latency',
        metricValue: status.metrics.avgAiLatency,
      });
    }

    // Check queue backlog
    if (status.metrics.pendingTasks > ALERT_THRESHOLDS.queuePending) {
      alerts.push({
        type: 'error',
        title: '任务队列堆积',
        message: `待处理任务数为 ${status.metrics.pendingTasks}，超过 ${ALERT_THRESHOLDS.queuePending} 阈值`,
        metricName: 'queue_pending',
        metricValue: status.metrics.pendingTasks,
      });
    }

    // Send alerts
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }

  /**
   * 记录 AI 延迟
   */
  recordAiLatency(latencyMs: number): void {
    this.aiLatencies.push(latencyMs);
    // Keep only last 100 samples
    if (this.aiLatencies.length > 100) {
      this.aiLatencies.shift();
    }
  }

  /**
   * 记录浏览器崩溃
   */
  recordBrowserCrash(): void {
    this.browserCrashCount++;
    if (this.browserCrashCount > ALERT_THRESHOLDS.browserCrashCount) {
      this.sendAlert({
        type: 'error',
        title: '浏览器崩溃频繁',
        message: `服务进程内浏览器已崩溃 ${this.browserCrashCount} 次，建议检查系统资源`,
        metricName: 'browser_crash_count',
        metricValue: this.browserCrashCount,
      });
    }
  }

  /**
   * 发送告警
   */
  async sendAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const id = uuidv4();

    const fullAlert: Alert = {
      id,
      ...alert,
      timestamp: now,
      acknowledged: false,
    };

    // Save to database
    db.prepare(`
      INSERT INTO alerts (id, type, title, message, timestamp, acknowledged, metric_name, metric_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      fullAlert.type,
      fullAlert.title,
      fullAlert.message,
      fullAlert.timestamp,
      fullAlert.acknowledged ? 1 : 0,
      fullAlert.metricName ?? null,
      fullAlert.metricValue ?? null
    );

    log.warn(`[ALERT] ${fullAlert.title}: ${fullAlert.message}`);

    // Show system notification for errors and warnings
    if (fullAlert.type === 'error' || fullAlert.type === 'warning') {
      this.showNotification(fullAlert);
    }
  }

  /**
   * 显示系统通知
   */
  private showNotification(alert: Alert): void {
    // Lazy import to avoid circular dependency
    import('electron').then(({ Notification }) => {
      if (Notification.isSupported()) {
        new Notification({
          title: `[AI运营大师] ${alert.title}`,
          body: alert.message,
        }).show();
      }
    }).catch(() => {
      // Electron not available in test environment
    });
  }

  /**
   * 获取告警列表
   */
  getAlerts(options: { limit?: number; unacknowledgedOnly?: boolean } = {}): Alert[] {
    const db = getDb();
    const { limit = 50, unacknowledgedOnly = false } = options;

    let query = 'SELECT * FROM alerts';
    const params: any[] = [];

    if (unacknowledgedOnly) {
      query += ' WHERE acknowledged = 0';
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = asRows<AlertRow>(db.prepare(query).all(...params));

    return rows.map(row => ({
      id: row.id,
      type: row.type as Alert['type'],
      title: row.title,
      message: row.message ?? '',
      timestamp: row.timestamp,
      acknowledged: row.acknowledged === 1,
      metricName: row.metric_name ?? undefined,
      metricValue: row.metric_value ?? undefined,
    }));
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(alertId: string): void {
    const db = getDb();
    db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(alertId);
  }

  /**
   * 记录指标
   */
  recordMetric(name: string, value: number, tags: Record<string, string> = {}): void {
    const db = getDb();
    const now = Date.now();

    db.prepare(`
      INSERT INTO metrics (id, metric_name, value, tags, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), name, value, JSON.stringify(tags), now);
  }

  /**
   * 获取指标历史
   */
  getMetrics(name: string, options: { from?: number; to?: number; limit?: number } = {}): Metric[] {
    const db = getDb();
    const { from, to, limit = 100 } = options;

    let query = 'SELECT * FROM metrics WHERE metric_name = ?';
    const params: any[] = [name];

    if (from) {
      query += ' AND timestamp >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND timestamp <= ?';
      params.push(to);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = asRows<MetricRow>(db.prepare(query).all(...params));

    return rows.map(row => ({
      id: row.id,
      name: row.metric_name,
      value: row.value,
      tags: JSON.parse(row.tags || '{}'),
      timestamp: row.timestamp,
    }));
  }

  /**
   * 收集当前指标
   */
  async collectMetrics(): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // ============ 任务统计 ============
    const taskStats = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' OR status = 'deferred' THEN 1 ELSE 0 END) as pending
      FROM tasks
      WHERE updated_at > ?
    `).get(oneHourAgo) as { completed: number; failed: number; pending: number } | undefined;

    const total = (taskStats?.completed ?? 0) + (taskStats?.failed ?? 0);
    const successRate = total > 0 ? (taskStats?.completed ?? 0) / total : 1;

    this.recordMetric('publish_success_rate', successRate);
    this.recordMetric('tasks_pending', taskStats?.pending ?? 0);
    this.recordMetric('tasks_completed', taskStats?.completed ?? 0);
    this.recordMetric('tasks_failed', taskStats?.failed ?? 0);

    // ============ 按平台统计 ============
    interface PlatformStatRow { platform: string; type: string; completed: number; failed: number }
    const platformStats = asRows<PlatformStatRow>(db.prepare(`
      SELECT
        platform,
        type,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
      WHERE updated_at > ?
      GROUP BY platform, type
    `).all(oneDayAgo));

    for (const stat of platformStats) {
      const platformTotal = stat.completed + stat.failed;
      const platformSuccessRate = platformTotal > 0 ? stat.completed / platformTotal : 1;
      this.recordMetric('platform_success_rate', platformSuccessRate, {
        platform: stat.platform,
        type: stat.type,
      });
    }

    // ============ 执行时长统计 ============
    const durationStats = db.prepare(`
      SELECT
        AVG(completed_at - started_at) as avg_duration_ms,
        MIN(completed_at - started_at) as min_duration_ms,
        MAX(completed_at - started_at) as max_duration_ms
      FROM tasks
      WHERE status = 'completed'
        AND completed_at IS NOT NULL
        AND started_at IS NOT NULL
        AND updated_at > ?
    `).get(oneDayAgo) as { avg_duration_ms: number; min_duration_ms: number; max_duration_ms: number } | undefined;

    if (durationStats?.avg_duration_ms) {
      this.recordMetric('task_avg_duration_ms', durationStats.avg_duration_ms);
      this.recordMetric('task_min_duration_ms', durationStats.min_duration_ms);
      this.recordMetric('task_max_duration_ms', durationStats.max_duration_ms);
    }

    // ============ 重试统计 ============
    const retryStats = db.prepare(`
      SELECT
        COUNT(*) as retried_tasks,
        AVG(retry_count) as avg_retries
      FROM tasks
      WHERE retry_count > 0
        AND updated_at > ?
    `).get(oneDayAgo) as { retried_tasks: number; avg_retries: number } | undefined;

    if (retryStats) {
      this.recordMetric('tasks_retried', retryStats.retried_tasks ?? 0);
      this.recordMetric('avg_retry_count', retryStats.avg_retries ?? 0);
    }

    // ============ 页面池统计 ============
    const pagePoolStatus = getPagePoolStatus();
    for (const [platform, status] of Object.entries(pagePoolStatus.byPlatform)) {
      this.recordMetric('page_pool_total', status.total, { platform });
      this.recordMetric('page_pool_in_use', status.inUse, { platform });
      this.recordMetric('page_pool_idle', status.idle, { platform });
    }

    // ============ 队列积压统计 ============
    const queueStats = taskQueue.getStats();
    this.recordMetric('queue_total', queueStats.total);
    this.recordMetric('queue_pending', queueStats.pending);
    this.recordMetric('queue_running', queueStats.running);
    this.recordMetric('queue_completed', queueStats.completed);
    this.recordMetric('queue_failed', queueStats.failed);
    this.recordMetric('queue_deferred', queueStats.deferred);

    // ============ AI 延迟 ============
    if (this.aiLatencies.length > 0) {
      const avgLatency = this.aiLatencies.reduce((a, b) => a + b, 0) / this.aiLatencies.length;
      this.recordMetric('ai_avg_latency', avgLatency);
    }
  }

  /**
   * 获取详细统计报告
   */
  async getDetailedStats(): Promise<{
    overview: {
      totalTasks: number;
      successRate: number;
      avgDuration: number;
      totalRetries: number;
    };
    byPlatform: Record<string, {
      successRate: number;
      avgDuration: number;
      taskCount: number;
    }>;
    pagePool: ReturnType<typeof getPagePoolStatus>;
    alerts: Alert[];
  }> {
    const db = getDb();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Overview
    const overview = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN completed_at - started_at ELSE NULL END) as avg_duration,
        SUM(retry_count) as total_retries
      FROM tasks
      WHERE updated_at > ?
    `).get(oneDayAgo) as { total: number; completed: number; failed: number; avg_duration: number; total_retries: number } | undefined;

    const successRate = (overview?.total ?? 0) > 0 ? (overview?.completed ?? 0) / (overview?.total ?? 0) : 1;

    // By platform
    interface PlatformStatRow2 { platform: string; total: number; completed: number; avg_duration: number }
    const platformStats = asRows<PlatformStatRow2>(db.prepare(`
      SELECT
        platform,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN completed_at - started_at ELSE NULL END) as avg_duration
      FROM tasks
      WHERE updated_at > ?
      GROUP BY platform
    `).all(oneDayAgo));

    const byPlatform: Record<string, any> = {};
    for (const stat of platformStats) {
      byPlatform[stat.platform] = {
        successRate: stat.total > 0 ? stat.completed / stat.total : 1,
        avgDuration: stat.avg_duration ?? 0,
        taskCount: stat.total,
      };
    }

    return {
      overview: {
        totalTasks: overview?.total ?? 0,
        successRate,
        avgDuration: overview?.avg_duration ?? 0,
        totalRetries: overview?.total_retries ?? 0,
      },
      byPlatform,
      pagePool: getPagePoolStatus(),
      alerts: this.getAlerts({ limit: 10 }),
    };
  }

  /**
   * 定时健康检查
   */
  private scheduleHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.healthCheck().catch(err => {
        log.error('Health check failed:', err);
      });
    }, this.healthCheckInterval);
  }

  /**
   * 获取仪表盘数据
   */
  async getDashboardData(): Promise<{
    todayPublishCount: number;
    successRate: number;
    pendingTasks: number;
    failedTasks24h: number;
    recentAlerts: Alert[];
    accountHealth: { platform: Platform; status: string }[];
  }> {
    const db = getDb();
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);

    // Today's publish count
    const todayStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM tasks
      WHERE type = 'publish' AND created_at >= ?
    `).get(todayStart) as { total: number; completed: number } | undefined;

    const todayPublishCount = todayStats?.completed ?? 0;

    // 24h stats
    const dayStats = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
      WHERE updated_at > ?
    `).get(now - 24 * 60 * 60 * 1000) as { completed: number; failed: number } | undefined;

    const total = (dayStats?.completed ?? 0) + (dayStats?.failed ?? 0);
    const successRate = total > 0 ? (dayStats?.completed ?? 0) / total : 1;

    // Pending tasks
    const pendingTasks = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE status = 'pending' OR status = 'deferred'
    `).get() as { count: number } | undefined;

    // Failed tasks in 24h
    const failedTasks24h = dayStats?.failed ?? 0;

    // Recent alerts
    const recentAlerts = this.getAlerts({ limit: 5 });

    // Account health from database
    const accountRows = db.prepare(`
      SELECT platform, status FROM accounts
    `).all() as { platform: Platform; status: string }[];

    const accountHealth = accountRows.map(row => ({
      platform: row.platform,
      status: row.status === 'active' ? 'active' : 'error',
    }));

    return {
      todayPublishCount,
      successRate,
      pendingTasks: pendingTasks?.count ?? 0,
      failedTasks24h,
      recentAlerts,
      accountHealth,
    };
  }
}

export const monitoringService = new MonitoringService();
