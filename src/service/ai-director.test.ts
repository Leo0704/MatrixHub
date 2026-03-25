import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Task, AIFailureResult, DailyPlan, HotTopicDecision } from '../shared/types.js';

// Use vi.hoisted to define mocks at the same hoisting level as vi.mock
const { mockBroadcast, mockCallAI, mockGetHotTopics, mockTaskQueueCreate, mockTaskQueueUpdateField, mockTaskQueueGet, mockDbInstance } = vi.hoisted(() => {
  return {
    mockBroadcast: vi.fn(),
    mockCallAI: vi.fn(),
    mockGetHotTopics: vi.fn(),
    mockTaskQueueCreate: vi.fn(),
    mockTaskQueueUpdateField: vi.fn(),
    mockTaskQueueGet: vi.fn(),
    mockDbInstance: {
      prepare: vi.fn(),
    },
  };
});

vi.mock('./db.js', () => ({
  getDb: () => mockDbInstance,
}));

vi.mock('./ipc-handlers.js', () => ({
  broadcastToRenderers: mockBroadcast,
}));

vi.mock('./strategy-engine.js', () => ({
  callAI: mockCallAI,
  buildFailureContext: vi.fn().mockReturnValue({}),
  buildDailyContext: vi.fn().mockReturnValue({}),
  buildHotTopicContext: vi.fn().mockReturnValue({}),
}));

vi.mock('./hot-topic-detector.js', () => ({
  getHotTopics: mockGetHotTopics,
}));

vi.mock('./queue.js', () => ({
  taskQueue: {
    create: mockTaskQueueCreate,
    updateField: mockTaskQueueUpdateField,
    get: mockTaskQueueGet,
  },
}));

// Import after mocking
import { analyzeFailure, dailyBriefing, checkHotTopics, analyzeNow } from './ai-director.js';

describe('AIDirector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      run: vi.fn().mockReturnValue({}),
    });
  });

  describe('analyzeFailure', () => {
    it('should analyze task failure and return feedback via broadcast', async () => {
      const mockTask: Task = {
        id: 'task-1',
        type: 'publish',
        platform: 'douyin',
        status: 'failed',
        title: 'Test Task',
        payload: {},
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };

      const mockResult: AIFailureResult = {
        taskId: 'task-1',
        diagnosis: '选择器失效',
        suggestions: ['更新选择器版本', '检查页面结构变化'],
        confidence: 0.85,
        shouldRetry: true,
        retryAdvice: {
          action: 'update_selector',
          params: { selectorKey: 'publish_button' },
        },
      };

      mockCallAI.mockResolvedValue(mockResult);

      await analyzeFailure(mockTask);

      expect(mockCallAI).toHaveBeenCalled();
      expect(mockBroadcast).toHaveBeenCalledWith('ai:feedback', {
        taskId: 'task-1',
        result: mockResult,
      });
    });

    it('should handle analysis count limit and skip', async () => {
      const mockTask: Task = {
        id: 'task-1',
        type: 'publish',
        platform: 'douyin',
        status: 'failed',
        title: 'Test Task',
        payload: {},
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };

      // Mock db to return analysis count at limit
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue({ ai_analysis_count: 2 }),
      });

      await analyzeFailure(mockTask);

      // Should skip and not call AI
      expect(mockCallAI).not.toHaveBeenCalled();
      expect(mockBroadcast).toHaveBeenCalledWith('ai:feedback', {
        taskId: 'task-1',
        skipped: true,
        reason: 'AI分析次数已达上限',
      });
    });
  });

  describe('dailyBriefing', () => {
    it('should generate daily content plan for platform', async () => {
      const mockResult: DailyPlan = {
        date: '2026-03-24',
        platform: 'douyin',
        recommendedTopics: ['美食探店', '春季穿搭'],
        bestTimes: [9, 12, 20],
        warnings: [],
        confidence: 0.85,
      };

      mockCallAI.mockResolvedValue(mockResult);
      mockTaskQueueCreate.mockResolvedValue(undefined);

      const result = await dailyBriefing('douyin');

      expect(result).toEqual(mockResult);
      expect(mockCallAI).toHaveBeenCalledWith('daily', expect.any(Object));
    });

    it('should not auto-create tasks when confidence is below threshold', async () => {
      const mockResult: DailyPlan = {
        date: '2026-03-24',
        platform: 'douyin',
        recommendedTopics: ['美食探店'],
        bestTimes: [9],
        warnings: [],
        confidence: 0.5, // Low confidence
      };

      mockCallAI.mockResolvedValue(mockResult);

      const result = await dailyBriefing('douyin');

      expect(result).toEqual(mockResult);
      expect(mockTaskQueueCreate).not.toHaveBeenCalled();
    });
  });

  describe('checkHotTopics', () => {
    it('should analyze hot topic and send recommendation when confidence is high', async () => {
      const mockHotTopics = [
        { topic: '春季穿搭',热度: 9500 },
      ];

      const mockDecision: HotTopicDecision = {
        topic: '春季穿搭',
        shouldChase: true,
        reason: '热度高，适合追热点',
        contentAngle: '通勤穿搭',
        confidence: 0.85,
      };

      mockGetHotTopics.mockResolvedValue(mockHotTopics);
      mockCallAI.mockResolvedValue(mockDecision);

      const result = await checkHotTopics('xiaohongshu');

      expect(result).toEqual(mockDecision);
      // 高置信度时发送热点追踪结果和推荐事件给用户确认
      expect(mockBroadcast).toHaveBeenCalledWith(
        'ai:hot-topic',
        expect.objectContaining({ platform: 'xiaohongshu' })
      );
      // 检查推荐事件包含正确的任务信息
      expect(mockBroadcast).toHaveBeenLastCalledWith(
        'ai:recommendation',
        expect.objectContaining({
          action: 'hot_topic',
          confidence: 0.85,
          params: expect.objectContaining({
            platform: 'xiaohongshu',
            task: expect.objectContaining({
              type: 'ai_generate',
              title: '蹭热点-春季穿搭',
            }),
          }),
        })
      );
    });

    it('should return null when no hot topics available', async () => {
      mockGetHotTopics.mockResolvedValue([]);

      const result = await checkHotTopics('douyin');

      expect(result).toBeNull();
      expect(mockCallAI).not.toHaveBeenCalled();
    });
  });

  describe('analyzeNow', () => {
    it('should dispatch failure analysis with taskId', async () => {
      const mockTask: Task = {
        id: 'task-1',
        type: 'publish',
        platform: 'douyin',
        status: 'failed',
        title: 'Test Task',
        payload: {},
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
      };

      const mockResult: AIFailureResult = {
        taskId: 'task-1',
        diagnosis: '测试诊断',
        suggestions: [],
        confidence: 0.8,
        shouldRetry: false,
      };

      mockTaskQueueGet.mockReturnValue(mockTask);
      mockCallAI.mockResolvedValue(mockResult);

      await analyzeNow('failure', 'douyin', 'task-1');

      expect(mockTaskQueueGet).toHaveBeenCalledWith('task-1');
    });

    it('should handle missing taskId for failure type', async () => {
      await analyzeNow('failure', 'douyin');

      expect(mockTaskQueueGet).not.toHaveBeenCalled();
    });

    it('should dispatch daily briefing', async () => {
      const mockResult: DailyPlan = {
        date: '2026-03-24',
        platform: 'douyin',
        recommendedTopics: [],
        bestTimes: [9],
        warnings: [],
        confidence: 0.8,
      };

      mockCallAI.mockResolvedValue(mockResult);

      await analyzeNow('daily', 'douyin');

      expect(mockCallAI).toHaveBeenCalled();
    });

    it('should dispatch hot topic check', async () => {
      mockGetHotTopics.mockResolvedValue([]);

      await analyzeNow('hot_topic', 'douyin');

      expect(mockGetHotTopics).toHaveBeenCalledWith('douyin');
    });
  });
});
