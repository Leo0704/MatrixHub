import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-log
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Test the singleton exported instance
import { runtimeConfig } from './runtime-config.js';

describe('runtimeConfig singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(runtimeConfig).toBeDefined();
  });

  it('should have getMaintenanceWindows', () => {
    expect(typeof runtimeConfig.getMaintenanceWindows).toBe('function');
  });

  it('should have getErrorWeights', () => {
    expect(typeof runtimeConfig.getErrorWeights).toBe('function');
  });

  it('should have getRateLimits', () => {
    expect(typeof runtimeConfig.getRateLimits).toBe('function');
  });

  it('should have getTaskStaleTimeout', () => {
    expect(typeof runtimeConfig.getTaskStaleTimeout).toBe('function');
  });

  it('should have load method', () => {
    expect(typeof runtimeConfig.load).toBe('function');
  });

  it('should have get method', () => {
    expect(typeof runtimeConfig.get).toBe('function');
  });

  it('should have update method', () => {
    expect(typeof runtimeConfig.update).toBe('function');
  });

  it('should have reload method', () => {
    expect(typeof runtimeConfig.reload).toBe('function');
  });

  it('should have resetToDefaults method', () => {
    expect(typeof runtimeConfig.resetToDefaults).toBe('function');
  });

  it('should have getKey method', () => {
    expect(typeof runtimeConfig.getKey).toBe('function');
  });

  it('should return maintenance windows', () => {
    const windows = runtimeConfig.getMaintenanceWindows();
    expect(windows.douyin).toBeDefined();
    expect(Array.isArray(windows.douyin)).toBe(true);
  });

  it('should return error weights with correct structure', () => {
    const weights = runtimeConfig.getErrorWeights();
    expect(weights.selector.weight).toBe(0.3);
    expect(weights.selector.waitMultiplier).toBe(1.0);
    expect(weights.rate_limit.weight).toBe(0.8);
  });

  it('should return rate limits per platform', () => {
    const limits = runtimeConfig.getRateLimits();
    expect(limits.douyin.requestsPerMinute).toBe(10);
    expect(limits.kuaishou.requestsPerMinute).toBe(15);
    expect(limits.xiaohongshu.requestsPerMinute).toBe(5);
  });

  it('should return task stale timeout of 1 hour', () => {
    expect(runtimeConfig.getTaskStaleTimeout()).toBe(60 * 60 * 1000);
  });

  it('should get specific key', () => {
    expect(runtimeConfig.getKey('taskStaleTimeoutMs')).toBe(60 * 60 * 1000);
    expect(runtimeConfig.getKey('maintenanceWindows')).toBeDefined();
  });
});

// Also test convenience exports
import {
  getMaintenanceWindows,
  getErrorWeights,
  getRateLimits,
  getTaskStaleTimeout,
} from './runtime-config.js';

describe('convenience exports', () => {
  it('getMaintenanceWindows should return windows', () => {
    const windows = getMaintenanceWindows();
    expect(windows.douyin).toBeDefined();
  });

  it('getErrorWeights should return weights', () => {
    const weights = getErrorWeights();
    expect(weights.selector).toBeDefined();
  });

  it('getRateLimits should return limits', () => {
    const limits = getRateLimits();
    expect(limits.douyin).toBeDefined();
  });

  it('getTaskStaleTimeout should return timeout', () => {
    expect(getTaskStaleTimeout()).toBe(60 * 60 * 1000);
  });
});
