/**
 * 运行时配置管理器
 * - 从数据库加载配置
 * - 支持运行时更新
 * - 默认值回退
 */
import { getDb } from '../db.js';
import type { Platform, RateLimitConfig } from '../../shared/types.js';
import log from 'electron-log';

// ============ 类型定义 ============

export interface MaintenanceWindow {
  start: number;  // 开始小时 (0-23)
  end: number;    // 结束小时 (0-24)
  reason?: string;
}

export interface ErrorWeight {
  weight: number;        // 错误权重 (0-1)
  waitMultiplier: number; // 等待时间乘数
}

export interface AntiFingerprintConfig {
  canvasNoiseAmplitude: number;   // Canvas 噪声幅度 (0-1)，默认 0.03
  webglVendorIndex: number;       // WebGL vendor 索引（0=随机）
  webglRendererIndex: number;     // WebGL renderer 索引（0=随机）
  viewportWidthRange: [number, number];  // Viewport 宽度范围 [min, max]
  viewportHeightRange: [number, number]; // Viewport 高度范围 [min, max]
  devicePixelRatio: number;        // 设备像素比，0=随机
  mouseSpeedMultiplier: number;    // 鼠标移动速度乘数（越大越慢）
}

export interface RuntimeConfig {
  maintenanceWindows: Record<Platform, MaintenanceWindow[]>;
  errorWeights: Record<string, ErrorWeight>;
  rateLimits: Record<Platform, RateLimitConfig>;
  taskStaleTimeoutMs: number;
  aiMaxAnalysisPerTask: number;  // AI 分析循环保护上限
  activeHours: { start: number; end: number };  // 用户活跃时段（北京时间，小时）
  antiFingerprint: AntiFingerprintConfig;  // 反指纹配置
  // 设计文档第10节：迭代决策阈值（可配置化）
  iterationThresholds: {
    stopViews: number;       // 连续迭代后平均播放量低于此值则停止（默认 500）
    iterateViews: number;    // 播放量低于此值则建议迭代（默认 1000）
  };
  // 设计文档第21节：每账号每日发布上限（可配置化，默认 2）
  campaignDailyLimit: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: RuntimeConfig = {
  maintenanceWindows: {
    douyin: [
      { start: 3, end: 5, reason: '抖音日常维护' },
      { start: 23, end: 24, reason: '日结时段' },
    ],
  },
  errorWeights: {
    selector: { weight: 0.3, waitMultiplier: 1.0 },
    rate_limit: { weight: 0.8, waitMultiplier: 3.0 },
    network: { weight: 0.5, waitMultiplier: 1.5 },
    login: { weight: 0.9, waitMultiplier: 5.0 },
    timeout: { weight: 0.4, waitMultiplier: 1.2 },
    unknown: { weight: 0.5, waitMultiplier: 1.0 },
  },
  rateLimits: {
    douyin: {
      platform: 'douyin',
      requestsPerMinute: 10,
      requestsPerHour: 200,
      requestsPerDay: 1000,
    },
  },
  taskStaleTimeoutMs: 60 * 60 * 1000, // 1 小时
  aiMaxAnalysisPerTask: 2,              // AI 分析循环保护上限
  activeHours: { start: 8, end: 22 },   // 用户活跃时段（北京时间 8:00-22:00）
  antiFingerprint: {
    canvasNoiseAmplitude: 0.03,
    webglVendorIndex: 0,              // 0 = 随机
    webglRendererIndex: 0,           // 0 = 随机
    viewportWidthRange: [1280, 1920],
    viewportHeightRange: [720, 1080],
    devicePixelRatio: 0,             // 0 = 随机
    mouseSpeedMultiplier: 1.5,       // 鼠标移动速度乘数
  },
  iterationThresholds: {
    stopViews: 500,
    iterateViews: 1000,
  },
  campaignDailyLimit: 2,
};

// ============ 配置管理器 ============

class RuntimeConfigManager {
  private config: RuntimeConfig;
  private loaded = false;

  constructor() {
    this.config = this.deepClone(DEFAULT_CONFIG);
  }

  /**
   * 深拷贝对象
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 加载配置（从数据库或使用默认值）
   */
  load(): RuntimeConfig {
    if (this.loaded) {
      return this.config;
    }

    try {
      const db = getDb();
      const rows = db.prepare('SELECT key, value FROM runtime_config').all() as Array<{ key: string; value: string }>;

      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.value);
          if (row.key in this.config) {
            (this.config as unknown as Record<string, unknown>)[row.key] = parsed;
            log.debug(`[Config] 加载配置: ${row.key}`);
          }
        } catch (e) {
          log.warn(`[Config] 解析配置失败: ${row.key}`, e);
        }
      }

      this.loaded = true;
      log.info('[Config] 配置加载完成');
    } catch (e) {
      // 数据库可能未初始化，使用默认配置
      log.warn('[Config] 加载配置失败，使用默认值', e);
    }

    return this.config;
  }

  /**
   * 重新加载配置（强制从数据库读取）
   */
  reload(): RuntimeConfig {
    this.loaded = false;
    this.config = this.deepClone(DEFAULT_CONFIG);
    return this.load();
  }

  /**
   * 获取完整配置（只读）
   */
  get(): Readonly<RuntimeConfig> {
    if (!this.loaded) {
      this.load();
    }
    return this.config;
  }

  /**
   * 更新单个配置项
   */
  update<K extends keyof RuntimeConfig>(key: K, value: RuntimeConfig[K]): void {
    const db = getDb();
    const now = Date.now();

    db.prepare(`
      INSERT OR REPLACE INTO runtime_config (key, value, updated_at)
      VALUES (?, ?, ?)
    `).run(key, JSON.stringify(value), now);

    this.config[key] = this.deepClone(value);
    log.info(`[Config] 配置已更新: ${key}`);
  }

  /**
   * 获取维护窗口配置
   */
  getMaintenanceWindows(): Record<Platform, MaintenanceWindow[]> {
    return this.get().maintenanceWindows;
  }

  /**
   * 获取错误权重配置
   */
  getErrorWeights(): Record<string, ErrorWeight> {
    return this.get().errorWeights;
  }

  /**
   * 获取限流配置
   */
  getRateLimits(): Record<Platform, RateLimitConfig> {
    return this.get().rateLimits;
  }

  /**
   * 获取任务超时配置
   */
  getTaskStaleTimeout(): number {
    return this.get().taskStaleTimeoutMs;
  }

  /**
   * 重置为默认配置
   */
  resetToDefaults(): void {
    const db = getDb();
    db.prepare('DELETE FROM runtime_config').run();
    this.config = this.deepClone(DEFAULT_CONFIG);
    this.loaded = true;
    log.info('[Config] 已重置为默认配置');
  }

  /**
   * 获取配置项（带类型）
   */
  getKey<K extends keyof RuntimeConfig>(key: K): RuntimeConfig[K] {
    return this.get()[key];
  }
}

// 单例导出
export const runtimeConfig = new RuntimeConfigManager();

// 便捷导出
export const getMaintenanceWindows = () => runtimeConfig.getMaintenanceWindows();
export const getErrorWeights = () => runtimeConfig.getErrorWeights();
export const getRateLimits = () => runtimeConfig.getRateLimits();
export const getTaskStaleTimeout = () => runtimeConfig.getTaskStaleTimeout();
export const getAiMaxAnalysisPerTask = () => runtimeConfig.getKey('aiMaxAnalysisPerTask');
export const getActiveHours = () => runtimeConfig.getKey('activeHours');
export const getAntiFingerprint = () => runtimeConfig.getKey('antiFingerprint');
export const getIterationThresholds = () => runtimeConfig.getKey('iterationThresholds');
export const getCampaignDailyLimit = () => runtimeConfig.getKey('campaignDailyLimit');
