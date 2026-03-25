/**
 * AI 生成任务处理器
 */
import type { Platform, Task, AIRequest } from '../../shared/types.js';
import { aiGateway, AIProviderType } from '../ai-gateway.js';
import { taskQueue } from '../queue.js';
import { buildCreativePrompt, getEnhancedSystemPrompt, type PromptType } from '../prompt-builder.js';
import { moderateContent } from '../content-moderator.js';
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

  // 内容审核
  const topicContent = payload.topic || '';
  const moderation = moderateContent(topicContent);
  if (!moderation.passed) {
    taskQueue.updateStatus(task.id, 'failed', {
      error: `内容审核未通过: ${moderation.reasons.join(', ')}`,
    });
    return;
  }

  // 获取配置的 provider，优先使用任务指定的，否则使用默认 provider
  const defaultProvider = aiGateway.getDefaultProvider();
  const providerType = payload.providerType ?? defaultProvider?.type ?? 'openai';

  const request: AIRequest = {
    providerType: providerType as AIProviderType,
    model: payload.model ?? defaultProvider?.models[0],
    prompt: buildCreativePrompt(
      (payload.promptType ?? 'default') as PromptType,
      payload.topic ?? '',
      payload.platform ?? 'douyin'
    ),
    system: getEnhancedSystemPrompt(payload.platform ?? 'douyin'),
    temperature: payload.temperature ?? 0.7,
    maxTokens: 6000,
  };

  const response = await aiGateway.generate(request);

  if (!response.success) {
    throw new Error(response.error ?? 'AI 生成失败');
  }

  // Moderate AI-generated content before returning
  const outputModeration = moderateContent(response.content ?? '');
  if (!outputModeration.passed) {
    log.warn('AI content failed moderation', { reasons: outputModeration.reasons });
    taskQueue.updateStatus(task.id, 'failed', {
      error: `AI生成内容审核未通过: ${outputModeration.reasons.join(', ')}`,
    });
    return;
  }

  taskQueue.updateStatus(task.id, 'running', {
    result: { content: response.content },
    progress: 100,
  });
}
