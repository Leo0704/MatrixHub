/**
 * AI 生成任务处理器
 */
import type { Platform, Task, AIRequest } from '../../shared/types.js';
import { aiGateway, AIProviderType } from '../ai-gateway.js';
import { taskQueue } from '../queue.js';
import { buildPrompt, getSystemPrompt } from '../config/prompts.js';
import log from 'electron-log';

interface AIGeneratePayload {
  platform?: Platform;
  promptType?: string;
  topic?: string;
  model?: string;
  temperature?: number;
  providerType?: string;
}

export async function executeAIGenerateTask(
  task: Task,
  signal: AbortSignal
): Promise<void> {
  const payload = task.payload as AIGeneratePayload;

  signal.throwIfAborted();

  // 获取配置的 provider，优先使用任务指定的，否则使用默认 provider
  const defaultProvider = aiGateway.getDefaultProvider();
  const providerType = payload.providerType ?? defaultProvider?.type ?? 'openai';

  const request: AIRequest = {
    providerType: providerType as AIProviderType,
    model: payload.model ?? defaultProvider?.models[0],
    prompt: buildPrompt(payload.promptType ?? 'default', payload.topic ?? ''),
    system: getSystemPrompt(payload.platform),
    temperature: payload.temperature ?? 0.7,
    maxTokens: 2000,
  };

  const response = await aiGateway.generate(request);

  if (!response.success) {
    throw new Error(response.error ?? 'AI 生成失败');
  }

  taskQueue.updateStatus(task.id, 'running', {
    result: { content: response.content },
    progress: 100,
  });
}
