import { getDb } from './db.js';
import { getRateLimits } from './config/runtime-config.js';
import type { Platform, RateLimitConfig } from '../shared/types.js';
import log from 'electron-log';
import { sleep } from './utils/sleep.js';
import { asRow } from './db-types.js';

interface LimitBucket {
  count: number;
  resetAt: number;  // ms
}

/**
 * 多层级限流器
 * - 分钟级
 * - 小时级
 * - 天级
 */
export class RateLimiter {
  private memoryCache: Map<string, LimitBucket> = new Map();
  private config: Record<Platform, RateLimitConfig>;
  // 改用 Promise 队列，避免自旋锁的 CPU 浪费
  private lockQueue: Map<string, {
    promise: Promise<void>;
    resolve: () => void;
  } | null> = new Map();

  constructor(config?: Partial<Record<Platform, RateLimitConfig>>) {
    // 从配置管理器加载限流配置
    const defaultLimits = getRateLimits();
    this.config = { ...defaultLimits };
    for (const platform of Object.keys(config ?? {}) as Platform[]) {
      this.config[platform] = { ...defaultLimits[platform], ...config![platform] };
    }
  }

  /**
   * 获取指定 key 的锁（Promise 队列方式，避免 CPU 空转）
   */
  private async acquireLock(key: string): Promise<() => void> {
    // 如果已有锁（且未释放），加入队列等待
    const existing = this.lockQueue.get(key);
    if (existing != null) {
      await existing.promise;
    }

    // 创建新锁
    let resolve: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    this.lockQueue.set(key, { promise, resolve: resolve! });

    // 返回释放函数
    return () => {
      const current = this.lockQueue.get(key);
      this.lockQueue.set(key, null); // 标记为已释放
      // 异步 resolve，让出执行权
      setImmediate(() => {
        this.lockQueue.delete(key);
        resolve!();
      });
    };
  }

  /**
   * 检查是否可以执行请求（不消耗配额）
   */
  check(platform: Platform): {
    allowed: boolean;
    waitMs?: number;
    minuteLevel: { current: number; max: number };
    hourLevel: { current: number; max: number };
    dayLevel: { current: number; max: number };
  } {
    const cfg = this.config[platform];
    const now = Date.now();

    const minuteBucket = this.getBucket(this.minuteKey(platform), 60000, now);
    const hourBucket = this.getBucket(this.hourKey(platform), 3600000, now);
    const dayBucket = this.getBucket(this.dayKey(platform), 86400000, now);

    // 计算最早需要等待的时间
    const waitTimes: number[] = [];

    if (minuteBucket.count >= cfg.requestsPerMinute) {
      waitTimes.push(minuteBucket.resetAt - now);
    }
    if (hourBucket.count >= cfg.requestsPerHour) {
      waitTimes.push(hourBucket.resetAt - now);
    }
    if (dayBucket.count >= cfg.requestsPerDay) {
      waitTimes.push(dayBucket.resetAt - now);
    }

    const waitMs = waitTimes.length > 0 ? Math.min(...waitTimes) : undefined;

    return {
      allowed: waitMs === undefined,
      waitMs,
      minuteLevel: { current: minuteBucket.count, max: cfg.requestsPerMinute },
      hourLevel: { current: hourBucket.count, max: cfg.requestsPerHour },
      dayLevel: { current: dayBucket.count, max: cfg.requestsPerDay },
    };
  }

  /**
   * 尝试获取执行许可（消耗配额）
   * 如果成功返回 true，失败返回 false
   * 使用互斥锁防止并发竞态条件
   */
  async acquire(platform: Platform): Promise<boolean> {
    const cfg = this.config[platform];
    const now = Date.now();

    // 使用锁保护读-改-写操作
    const release = await this.acquireLock(platform);

    try {
      const minuteBucket = this.getBucket(this.minuteKey(platform), 60000, now, true);
      const hourBucket = this.getBucket(this.hourKey(platform), 3600000, now, true);
      const dayBucket = this.getBucket(this.dayKey(platform), 86400000, now, true);

      if (minuteBucket.count >= cfg.requestsPerMinute) return false;
      if (hourBucket.count >= cfg.requestsPerHour) return false;
      if (dayBucket.count >= cfg.requestsPerDay) return false;

      // 所有检查通过，消耗配额
      minuteBucket.count++;
      hourBucket.count++;
      dayBucket.count++;

      // 持久化到数据库
      this.persistCount(this.minuteKey(platform), minuteBucket);
      this.persistCount(this.hourKey(platform), hourBucket);
      this.persistCount(this.dayKey(platform), dayBucket);

      log.debug(`RateLimit 获取成功: ${platform} (min:${minuteBucket.count}/${cfg.requestsPerMinute})`);
      return true;
    } finally {
      release();
    }
  }

  /**
   * 获取许可或等待
   * 返回 Promise，resolve 表示获得许可，reject 表示超时
   */
  async acquireAsync(platform: Platform, timeoutMs: number = 60000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.acquire(platform)) {
        return;
      }

      const check = this.check(platform);
      const waitTime = Math.min(check.waitMs ?? 1000, 5000);

      await sleep(waitTime);
    }

    throw new Error(`RateLimit 获取超时: ${platform} (${timeoutMs}ms)`);
  }

  /**
   * 获取当前配额状态
   */
  getStatus(platform: Platform): {
    minute: { remaining: number; resetAt: number };
    hour: { remaining: number; resetAt: number };
    day: { remaining: number; resetAt: number };
  } {
    const cfg = this.config[platform];
    const now = Date.now();

    const minuteBucket = this.getBucket(this.minuteKey(platform), 60000, now);
    const hourBucket = this.getBucket(this.hourKey(platform), 3600000, now);
    const dayBucket = this.getBucket(this.dayKey(platform), 86400000, now);

    return {
      minute: {
        remaining: Math.max(0, cfg.requestsPerMinute - minuteBucket.count),
        resetAt: minuteBucket.resetAt,
      },
      hour: {
        remaining: Math.max(0, cfg.requestsPerHour - hourBucket.count),
        resetAt: hourBucket.resetAt,
      },
      day: {
        remaining: Math.max(0, cfg.requestsPerDay - dayBucket.count),
        resetAt: dayBucket.resetAt,
      },
    };
  }

  /**
   * 重置所有配额
   */
  reset(platform: Platform): void {
    const now = Date.now();
    this.memoryCache.delete(this.minuteKey(platform));
    this.memoryCache.delete(this.hourKey(platform));
    this.memoryCache.delete(this.dayKey(platform));

    // 清理数据库中过期的记录
    const db = getDb();
    db.prepare(`
      DELETE FROM rate_limits WHERE key LIKE ? AND reset_at < ?
    `).run(`${platform}:`, now);

    log.info(`RateLimit 重置: ${platform}`);
  }

  private getBucket(
    key: string,
    windowMs: number,
    now: number,
    increment = false
  ): LimitBucket {
    // 1. 尝试内存缓存
    const cached = this.memoryCache.get(key);
    if (cached && cached.resetAt > now) {
      if (increment) {
        cached.count++;
      }
      return cached;
    }

    // 2. 从数据库加载
    const db = getDb();
    const windowStart = now - windowMs;

    const row = db.prepare(`
      SELECT SUM(count) as total_count, MAX(reset_at) as reset_at
      FROM rate_limits
      WHERE key = ? AND reset_at > ?
    `).get(key, windowStart) as { total_count: number; reset_at: number } | undefined;

    const count = row?.total_count ?? 0;
    const resetAt = row?.reset_at ?? (now + windowMs);

    const bucket: LimitBucket = {
      count,
      resetAt,
    };

    // 如果需要增加，更新并持久化
    if (increment) {
      bucket.count++;
      this.persistCount(key, bucket);
    }

    // 写回内存
    this.memoryCache.set(key, bucket);

    return bucket;
  }

  private persistCount(key: string, bucket: LimitBucket): void {
    const db = getDb();

    // 按时间窗口去重写入
    // 修复: 使用 bucket.count 而非硬编码 1，使用 excluded.count 而非 count + 1
    db.prepare(`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key, reset_at) DO UPDATE SET count = rate_limits.count + excluded.count
    `).run(key, bucket.count, bucket.resetAt);

    // 清理过期数据
    const cutoff = Date.now() - 86400000 * 2;
    db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(cutoff);
  }

  private minuteKey(platform: Platform): string {
    const minute = Math.floor(Date.now() / 60000);
    return `${platform}:minute:${minute}`;
  }

  private hourKey(platform: Platform): string {
    const hour = Math.floor(Date.now() / 3600000);
    return `${platform}:hour:${hour}`;
  }

  private dayKey(platform: Platform): string {
    const day = Math.floor(Date.now() / 86400000);
    return `${platform}:day:${day}`;
  }
}

export const rateLimiter = new RateLimiter();
