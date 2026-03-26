import { describe, it, expect } from 'vitest';
import { buildPublishSchedule } from './publish-scheduler';

describe('publish-scheduler', () => {
  describe('buildPublishSchedule', () => {
    it('should return empty array for no target accounts', () => {
      const campaign = makeCampaign({ targetAccountIds: [] });
      const schedule = buildPublishSchedule(campaign, []);
      expect(schedule).toHaveLength(0);
    });

    it('should create one schedule per account', () => {
      const campaign = makeCampaign({ targetAccountIds: ['a', 'b', 'c'] });
      const schedule = buildPublishSchedule(campaign, []);
      expect(schedule).toHaveLength(3);
    });

    it('should disperse posts by at least 10 minutes between accounts', () => {
      const campaign = makeCampaign({ targetAccountIds: ['a', 'b', 'c'] });
      const schedule = buildPublishSchedule(campaign, []);
      const delays = schedule.map(s => s.delayMinutes).sort((a, b) => a - b);

      expect(delays[1] - delays[0]).toBeGreaterThanOrEqual(10);
      expect(delays[2] - delays[1]).toBeGreaterThanOrEqual(10);
    });

    it('should respect daily limit', () => {
      const campaign = makeCampaign({ targetAccountIds: ['a', 'b'] });
      const records = [
        { accountId: 'a', lastPublishedAt: Date.now(), publishedToday: 2 },
        { accountId: 'b', lastPublishedAt: Date.now(), publishedToday: 2 },
      ];
      const schedule = buildPublishSchedule(campaign, records);
      // 所有账号都超过每日上限，应该都被推迟到明天
      expect(schedule.every(s => s.delayMinutes > 24 * 60)).toBe(true);
    });

    it('should respect cooldown', () => {
      const campaign = makeCampaign({ targetAccountIds: ['a'] });
      const records = [
        { accountId: 'a', lastPublishedAt: Date.now() - 60 * 60 * 1000, publishedToday: 1 }, // 1小时前发布
      ];
      const schedule = buildPublishSchedule(campaign, records);
      // 冷却4小时，所以延迟应该>=3小时
      expect(schedule[0].delayMinutes).toBeGreaterThanOrEqual(3 * 60);
    });
  });
});

function makeCampaign(overrides: Partial<{ targetAccountIds: string[] }>) {
  return {
    id: 'test-campaign',
    name: 'Test',
    contentType: 'video' as const,
    addVoiceover: false,
    marketingGoal: 'exposure' as const,
    targetAccountIds: overrides.targetAccountIds || [],
    status: 'running' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentIteration: 0,
    consecutiveFailures: 0,
  };
}
