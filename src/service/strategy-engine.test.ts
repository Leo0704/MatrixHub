import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    })),
    transaction: (fn: Function) => fn(),
    close: vi.fn(),
  },
}));

const { mockGenerate } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
}));

vi.mock('./db.js', () => ({ getDb: () => mockDb }));
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./ai-gateway.js', () => ({
  aiGateway: { generate: mockGenerate },
}));

import {
  buildFailureContext,
  buildDailyContext,
  buildHotTopicContext,
  buildPrompt,
  parseAIOutput,
  callAI,
} from './strategy-engine.js';

describe('strategy-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockImplementation(() => ({
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    }));
  });

  // --- buildPrompt tests ---

  describe('buildPrompt()', () => {
    it('should build failure prompt with role and task', () => {
      const prompt = buildPrompt('failure', { platform: 'douyin', error: 'test error' });
      const parsed = JSON.parse(prompt);
      expect(parsed.role).toBe('社交媒体发布失败分析专家');
      expect(parsed.task).toBe('分析以下任务失败原因，给出修复建议');
      expect(parsed.context).toEqual({ platform: 'douyin', error: 'test error' });
    });

    it('should build daily prompt', () => {
      const prompt = buildPrompt('daily', { platform: 'douyin' });
      const parsed = JSON.parse(prompt);
      expect(parsed.role).toBe('社交媒体内容策略专家');
      expect(parsed.task).toBe('根据近期数据，制定今日内容计划');
    });

    it('should build hot_topic prompt', () => {
      const prompt = buildPrompt('hot_topic', { keyword: 'test' });
      const parsed = JSON.parse(prompt);
      expect(parsed.role).toBe('热点蹭点策略专家');
      expect(parsed.task).toBe('判断是否要蹭某个热点');
    });

    it('should include failure output format with shouldRetry', () => {
      const prompt = buildPrompt('failure', {});
      const parsed = JSON.parse(prompt);
      expect(parsed.outputFormat).toHaveProperty('diagnosis');
      expect(parsed.outputFormat).toHaveProperty('suggestions');
      expect(parsed.outputFormat).toHaveProperty('shouldRetry');
      expect(parsed.outputFormat).toHaveProperty('retryAdvice');
    });

    it('should include daily output format with recommendedTopics', () => {
      const prompt = buildPrompt('daily', {});
      const parsed = JSON.parse(prompt);
      expect(parsed.outputFormat).toHaveProperty('recommendedTopics');
      expect(parsed.outputFormat).toHaveProperty('bestTimes');
    });

    it('should include hot_topic output format with shouldChase', () => {
      const prompt = buildPrompt('hot_topic', {});
      const parsed = JSON.parse(prompt);
      expect(parsed.outputFormat).toHaveProperty('shouldChase');
      expect(parsed.outputFormat).toHaveProperty('contentAngle');
    });
  });

  // --- parseAIOutput tests ---

  describe('parseAIOutput()', () => {
    it('should parse valid JSON', () => {
      const result = parseAIOutput('{"diagnosis":"测试","confidence":0.8}');
      expect(result.diagnosis).toBe('测试');
      expect(result.confidence).toBe(0.8);
    });

    it('should throw for invalid JSON', () => {
      expect(() => parseAIOutput('not json')).toThrow('AI返回不是有效JSON');
    });

    it('should clamp confidence > 1 to 0.5', () => {
      const result = parseAIOutput('{"diagnosis":"测试","confidence":1.5}');
      expect(result.confidence).toBe(0.5);
    });

    it('should clamp confidence < 0 to 0.5', () => {
      const result = parseAIOutput('{"diagnosis":"测试","confidence":-0.5}');
      expect(result.confidence).toBe(0.5);
    });

    it('should keep valid confidence unchanged', () => {
      const result = parseAIOutput('{"diagnosis":"测试","confidence":0.7}');
      expect(result.confidence).toBe(0.7);
    });
  });

  // --- buildFailureContext tests ---

  describe('buildFailureContext()', () => {
    it('should query recent failures and stats', () => {
      const task = {
        id: 'task-1',
        type: 'publish' as const,
        platform: 'douyin' as const,
        status: 'failed' as const,
        title: 'Test',
        error: 'Selector not found',
        retryCount: 2,
        payload: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        maxRetries: 3,
      };

      const mockFailuresAll = vi.fn(() => [{ error: 'prev error', created_at: Date.now() }]);
      const mockStatsGet = vi.fn(() => ({ total: 10, completed: 7 }));

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT error, created_at')) {
          return { all: mockFailuresAll };
        }
        if (sql.includes('COUNT(*)')) {
          return { get: mockStatsGet };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null) };
      });

      const ctx = buildFailureContext(task);

      expect(ctx).toMatchObject({
        platform: 'douyin',
        taskType: 'publish',
        title: 'Test',
        error: 'Selector not found',
        retryCount: 2,
      });
      expect((ctx as any).accountStats).toEqual({
        totalPublished: 10,
        successRate: 0.7,
      });
    });
  });

  // --- buildDailyContext tests ---

  describe('buildDailyContext()', () => {
    it('should query yesterday results and week stats', () => {
      // Create fresh mock functions for this test
      const mockAll = vi.fn(() => [{ title: 'Task 1', status: 'completed', error: null }]);
      const mockWeekGet = vi.fn(() => ({ total: 20, completed: 15, failed: 3 }));
      const mockAccountGet = vi.fn(() => ({ status: 'active', last_used_at: Date.now() }));
      const mockEmptyGet = vi.fn(() => null);

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT title, status, error')) {
          return { all: mockAll };
        }
        if (sql.includes('SUM(CASE WHEN')) {
          return { get: mockWeekGet };
        }
        if (sql.includes('FROM accounts')) {
          return { get: mockAccountGet };
        }
        return { all: vi.fn(() => []), get: mockEmptyGet };
      });

      const ctx = buildDailyContext('douyin');

      expect((ctx as any).platform).toBe('douyin');
      expect((ctx as any).yesterdayResults).toHaveLength(1);
      expect((ctx as any).last7Days.totalPublished).toBe(20);
    });
  });

  // --- buildHotTopicContext tests ---

  describe('buildHotTopicContext()', () => {
    it('should calculate avgEngagement from recent tasks', () => {
      const mockRecentAll = vi.fn(() => [
        { title: 'Task 1', result: '{"engagement":100}' },
        { title: 'Task 2', result: '{"engagement":200}' },
      ]);

      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT title, result')) {
          return { all: mockRecentAll };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null) };
      });

      const ctx = buildHotTopicContext('douyin', { keyword: '热点', heatScore: 5000 });

      expect((ctx as any).platform).toBe('douyin');
      expect((ctx as any).hotTopic.normalizedScore).toBe(0.5);
      expect((ctx as any).accountFit.avgEngagement).toBe(150);
    });

    it('should handle tasks without engagement gracefully', () => {
      mockDb.prepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT title, result')) {
          return { all: vi.fn(() => [{ title: 'Task', result: 'invalid json' }]) };
        }
        return { all: vi.fn(() => []), get: vi.fn(() => null) };
      });

      const ctx = buildHotTopicContext('douyin', { keyword: '热点', heatScore: 5000 });
      expect((ctx as any).accountFit.avgEngagement).toBe(0);
    });
  });

  // --- callAI tests ---

  describe('callAI()', () => {
    it('should return parsed result on successful call', async () => {
      mockGenerate.mockResolvedValue({
        success: true,
        content: '{"diagnosis":"分析成功","confidence":0.9}',
      });

      const result = await callAI('failure', { platform: 'douyin' });

      expect(result.diagnosis).toBe('分析成功');
      expect(result.confidence).toBe(0.9);
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    it('should throw on AI failure', async () => {
      mockGenerate.mockResolvedValue({
        success: false,
        error: 'AI 服务不可用',
      });

      await expect(callAI('failure', {})).rejects.toThrow('AI 服务不可用');
    });

    it('should retry on parse failure', async () => {
      mockGenerate
        .mockResolvedValueOnce({ success: true, content: 'not valid json' })
        .mockResolvedValueOnce({ success: true, content: '{"diagnosis":"after retry","confidence":0.5}' });

      const result = await callAI('failure', {});

      expect(result.diagnosis).toBe('after retry');
      expect(mockGenerate).toHaveBeenCalledTimes(2);
    });

    it('should throw if retry also fails', async () => {
      mockGenerate
        .mockResolvedValueOnce({ success: true, content: 'not json' })
        .mockResolvedValueOnce({ success: false, error: 'Retry failed' });

      await expect(callAI('failure', {})).rejects.toThrow('Retry failed');
    });
  });
});
