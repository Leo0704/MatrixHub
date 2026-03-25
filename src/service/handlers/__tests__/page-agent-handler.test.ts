import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePageAgentTask } from '../page-agent-handler.js';
import type { Task } from '../../../shared/types.js';

vi.mock('../../ai-gateway.js', () => ({
  aiGateway: {
    generate: vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        evaluation: 'The page shows login form',
        memory: 'User needs to login',
        nextGoal: 'Click login button',
        action: { click_element: { index: 1 } },
      }),
    }),
  },
}));

vi.mock('../../utils/dom-extractor.js', () => ({
  extractPageSnapshot: vi.fn().mockResolvedValue({
    info: { url: 'https://example.com', title: 'Test' },
    elements: [
      { index: 0, tag: 'button', text: 'Cancel', ariaLabel: null, placeholder: null },
      { index: 1, tag: 'button', text: 'Login', ariaLabel: null, placeholder: null },
    ],
  }),
  formatSnapshotForLLM: vi.fn().mockReturnValue('Page snapshot'),
}));

vi.mock('../../config/page-agent-prompts.js', () => ({
  PAGE_AGENT_SYSTEM_PROMPT: 'You are a page agent',
  buildUserPrompt: vi.fn().mockReturnValue('User prompt'),
  parseLLMAction: vi.fn().mockReturnValue({
    evaluation: 'The page shows login form',
    memory: 'User needs to login',
    nextGoal: 'Click login button',
    action: { click_element: { index: 1 } },
  }),
}));

vi.mock('../../utils/page-helpers.js', () => ({
  randomDelay: vi.fn(),
}));

describe('Page Agent Handler', () => {
  let mockPage: any;
  let mockTask: Task;
  let mockSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = {
      evaluate: vi.fn().mockResolvedValue(true),
      waitForTimeout: vi.fn(),
      viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    };
    mockTask = {
      id: 'task-1',
      platform: 'douyin',
      type: 'page_agent',
      payload: { goal: 'Login to the site', platform: 'douyin', accountId: 'acc-1' },
    } as Task;
    mockSignal = {
      throwIfAborted: vi.fn(),
    } as any;
  });

  it('should execute page agent task successfully', async () => {
    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('actions');
    expect(result).toHaveProperty('observations');
  });

  it('should return success when done action is returned', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Task complete',
      memory: 'Done',
      nextGoal: 'None',
      action: { done: { text: 'Logged in successfully' } },
    });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(true);
    expect(result.finalText).toBe('Logged in successfully');
  });

  it('should throw AbortError when signal is aborted', async () => {
    const { extractPageSnapshot } = await import('../../utils/dom-extractor.js');
    extractPageSnapshot.mockRejectedValueOnce(new Error('AbortError'));

    await expect(executePageAgentTask(mockPage, mockTask, mockSignal))
      .rejects.toThrow('AbortError');
  });

  it('should return error when LLM call fails', async () => {
    const { aiGateway } = await import('../../ai-gateway.js');
    aiGateway.generate.mockResolvedValueOnce({ success: false, error: 'API Error' });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM 调用失败');
  });

  it('should return error when LLM response cannot be parsed', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce(null);

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法解析 LLM 响应');
  });

  it('should throw when max steps exceeded', async () => {
    const maxStepsTask = {
      ...mockTask,
      payload: { goal: 'Test', platform: 'douyin', accountId: 'acc-1', maxSteps: 1 },
    } as any;
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    // Return non-done action every time
    parseLLMAction.mockReturnValue({
      evaluation: 'Continue',
      memory: 'Continue',
      nextGoal: 'Continue',
      action: { wait: { seconds: 1 } },
    });

    const result = await executePageAgentTask(mockPage, maxStepsTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toBe('达到最大步数限制');
  });

  it('should throw when element cannot be clicked', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Need to click',
      memory: 'Click element',
      nextGoal: 'Click',
      action: { click_element: { index: 1 } }, // Valid index that exists in snapshot
    });

    // Mock page.evaluate to return false (element cannot be clicked)
    mockPage.evaluate.mockResolvedValueOnce(false);

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法点击元素');
  });

  it('should throw when text cannot be input', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Need to input',
      memory: 'Input text',
      nextGoal: 'Input',
      action: { input_text: { index: 1, text: 'hello' } }, // Valid index
    });

    // Mock page.evaluate to return false (element cannot be filled)
    mockPage.evaluate.mockResolvedValueOnce(false);

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('无法输入文本');
  });

  it('should throw on unknown action type', async () => {
    const { parseLLMAction } = await import('../../config/page-agent-prompts.js');
    parseLLMAction.mockReturnValueOnce({
      evaluation: 'Unknown',
      memory: 'Unknown',
      nextGoal: 'Unknown',
      action: { unknown_action: {} },
    });

    const result = await executePageAgentTask(mockPage, mockTask, mockSignal);

    expect(result.success).toBe(false);
    expect(result.error).toContain('未知操作类型');
  });
});
