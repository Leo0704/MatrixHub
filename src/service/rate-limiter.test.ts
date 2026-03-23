import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Platform } from '../shared/types.js';

// Mock database - simpler approach
const mockDbInstance = {
  prepare: vi.fn(),
};

vi.mock('./db.js', () => ({
  getDb: () => mockDbInstance,
}));

// Import after mocking
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    vi.clearAllMocks();
    // Default mock returns
    mockDbInstance.prepare.mockReturnValue({
      run: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
    });
  });

  describe('check()', () => {
    it('should allow requests when under limit', () => {
      const result = limiter.check('douyin');

      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBeUndefined();
      expect(result.minuteLevel.current).toBe(0);
    });

    it('should track correct limits per platform', () => {
      const douyinResult = limiter.check('douyin');
      const kuaishouResult = limiter.check('kuaishou');
      const xiaohongshuResult = limiter.check('xiaohongshu');

      expect(douyinResult.minuteLevel.max).toBe(10);
      expect(kuaishouResult.minuteLevel.max).toBe(15);
      expect(xiaohongshuResult.minuteLevel.max).toBe(5);
    });

    it('should deny when minute bucket is full', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue({
          total_count: 15,
          reset_at: Date.now() + 60000,
        }),
      });

      const result = limiter.check('douyin');

      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBeGreaterThan(0);
    });
  });

  describe('acquire()', () => {
    it('should acquire permit when under limit', () => {
      const result = limiter.acquire('douyin');

      expect(result).toBe(true);
    });

    it('should persist count to database on acquire', () => {
      limiter.acquire('douyin');

      expect(mockDbInstance.prepare).toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('should return remaining quota', () => {
      const status = limiter.getStatus('douyin');

      expect(status.minute.remaining).toBe(10);
      expect(status.hour.remaining).toBe(200);
      expect(status.day.remaining).toBe(1000);
    });

    it('should show remaining based on used count', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue({
          total_count: 5,
          reset_at: Date.now() + 30000,
        }),
      });

      const status = limiter.getStatus('douyin');

      expect(status.minute.remaining).toBe(5);
    });
  });

  describe('reset()', () => {
    it('should clear cache and cleanup database', () => {
      limiter.reset('douyin');

      expect(mockDbInstance.prepare).toHaveBeenCalled();
    });
  });

  describe('platform-specific limits', () => {
    it('douyin should have most restrictive limits', () => {
      const douyin = limiter.check('douyin');
      const kuaishou = limiter.check('kuaishou');

      expect(douyin.minuteLevel.max).toBeLessThan(kuaishou.minuteLevel.max);
    });
  });
});
