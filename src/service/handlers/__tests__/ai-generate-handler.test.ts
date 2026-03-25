import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAIGenerateTask } from '../ai-generate-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('../../ai-gateway.js', () => ({
  aiGateway: {
    getDefaultProvider: vi.fn().mockReturnValue({ type: 'openai', models: ['gpt-4'] }),
    generate: vi.fn().mockResolvedValue({ success: true, content: 'Generated content' }),
  },
}));

vi.mock('../../queue.js', () => ({
  taskQueue: {
    updateStatus: vi.fn(),
    updateProgress: vi.fn(),
  },
}));

vi.mock('../../content-moderator.js', () => ({
  moderateContent: vi.fn().mockReturnValue({ passed: true, reasons: [] }),
}));

vi.mock('../../prompt-builder.js', () => ({
  buildCreativePrompt: vi.fn().mockReturnValue('built prompt'),
  getEnhancedSystemPrompt: vi.fn().mockReturnValue('system prompt'),
}));

describe('AI Generate Handler', () => {
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'ai_generate',
      status: 'pending',
      payload: { topic: 'test topic', platform: 'douyin' },
      createdAt: Date.now(),
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should generate content successfully', async () => {
    const { taskQueue } = await import('../../queue.js');

    await executeAIGenerateTask(mockTask, mockSignal);

    expect(mockSignal.throwIfAborted).toHaveBeenCalled();
    // updateProgress is not called in success path - only updateStatus marks completion
    expect(taskQueue.updateProgress).not.toHaveBeenCalled();
    expect(taskQueue.updateStatus).toHaveBeenCalledWith('task-1', 'running', {
      result: { content: 'Generated content' },
      progress: 100,
    });
  });

  it('should fail content moderation and update task status', async () => {
    const { moderateContent } = await import('../../content-moderator.js');
    moderateContent.mockReturnValueOnce({ passed: false, reasons: ['inappropriate'] });

    await executeAIGenerateTask(mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.updateStatus).toHaveBeenCalledWith('task-1', 'failed', {
      error: expect.stringContaining('内容审核未通过'),
    });
  });

  it('should throw error when AI generation fails', async () => {
    const { aiGateway } = await import('../../ai-gateway.js');
    // Use undefined error to trigger the fallback message
    aiGateway.generate.mockResolvedValueOnce({ success: false, error: undefined });

    await expect(executeAIGenerateTask(mockTask, mockSignal)).rejects.toThrow('AI 生成失败');
  });

  it('should throw API error message when AI generation fails with error detail', async () => {
    const { aiGateway } = await import('../../ai-gateway.js');
    aiGateway.generate.mockResolvedValueOnce({ success: false, error: 'Rate limit exceeded' });

    await expect(executeAIGenerateTask(mockTask, mockSignal)).rejects.toThrow('Rate limit exceeded');
  });

  it('should fail moderation of AI output and update task status', async () => {
    const { moderateContent } = await import('../../content-moderator.js');
    moderateContent.mockReturnValueOnce({ passed: true, reasons: [] }); // input passes
    moderateContent.mockReturnValueOnce({ passed: false, reasons: ['unsafe'] }); // output fails

    await executeAIGenerateTask(mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.updateStatus).toHaveBeenCalledWith('task-1', 'failed', {
      error: expect.stringContaining('AI生成内容审核未通过'),
    });
  });

  it('should update task with generated content on success', async () => {
    await executeAIGenerateTask(mockTask, mockSignal);

    const { taskQueue } = await import('../../queue.js');
    expect(taskQueue.updateStatus).toHaveBeenCalledWith('task-1', 'running', {
      result: { content: 'Generated content' },
      progress: 100,
    });
  });
});
