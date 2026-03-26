/**
 * AI IPC Handlers — AI 相关的所有 IPC handler
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { aiGateway } from '../ai-gateway.js';
import { taskQueue } from '../queue.js';
import { dailyBriefing, checkHotTopics, analyzeNow } from '../ai-director.js';
import { broadcastToRenderers } from '../ipc-utils.js';
import { getDb } from '../db.js';
import { aiKeyManager } from '../credential-manager.js';
import { z } from 'zod';
import { isUrlSafe } from '../../shared/url-utils.js';
import { IPC_TIMEOUT_MS, IpcChannel } from '../../shared/ipc-channels.js';
import type { AIRequest, AIIterationRequest, AITriggerType, Platform } from '../../shared/types.js';
import type { AIProviderType } from '../ai-gateway.js';

const aiTestConnectionSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

interface TaskAIConfigRow {
  task_type: string;
  base_url: string;
  api_key: string;
  model: string;
  created_at: number;
  updated_at: number;
}

function withTimeout<T>(promise: Promise<T>, channel: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`IPC ${channel} timed out after ${IPC_TIMEOUT_MS}ms`)), IPC_TIMEOUT_MS)
    ),
  ]) as Promise<T>;
}

export function registerAIHandlers(): void {
  ipcMain.handle(IpcChannel.AI_GENERATE, async (_event, request: AIRequest) => {
    return withTimeout(aiGateway.generate(request), IpcChannel.AI_GENERATE);
  });

  ipcMain.handle(IpcChannel.AI_ITERATE, async (_event, request: AIIterationRequest) => {
    return withTimeout(aiGateway.iterate(request), IpcChannel.AI_ITERATE);
  });

  ipcMain.handle(IpcChannel.AI_PROVIDERS, async () => {
    const providers: Array<{
      id: string; name: string; type: string; baseUrl: string;
      models: string[]; isDefault: boolean; status: string;
    }> = [];
    for (const [, provider] of aiGateway.providers) {
      providers.push({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        models: provider.models,
        isDefault: provider.isDefault,
        status: provider.status,
      });
    }
    return providers;
  });

  ipcMain.handle(IpcChannel.AI_ADD_PROVIDER, async (_event, params: {
    name: string;
    type: string;
    apiKey: string;
    baseUrl: string;
    models: string[];
    isDefault?: boolean;
  }) => {
    try {
      const provider = await aiGateway.addProvider({
        name: params.name,
        type: params.type as AIProviderType,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        models: params.models,
        isDefault: params.isDefault,
      });
      return { success: true, provider };
    } catch (error) {
      log.error('Failed to add AI provider:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.AI_TEST_CONNECTION, async (_event, params: { baseUrl: string; apiKey: string; model: string }) => {
    try {
      const parsed = aiTestConnectionSchema.safeParse(params);
      if (!parsed.success) {
        log.warn('ai:test-connection validation failed:', parsed.error.issues);
        return { success: false, error: `Invalid params: ${parsed.error.issues[0]?.message}` };
      }
      if (!isUrlSafe(parsed.data.baseUrl)) {
        return { success: false, error: 'Invalid URL: internal network addresses are not allowed' };
      }
      const response = await fetch(`${parsed.data.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parsed.data.apiKey}`,
        },
        body: JSON.stringify({
          model: parsed.data.model,
          messages: [{ role: 'user', content: 'hello' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(IPC_TIMEOUT_MS),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }
      const data = await response.json() as { error?: unknown };
      if (data.error) {
        return { success: false, error: typeof data.error === 'object' ? JSON.stringify(data.error) : String(data.error) };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.AI_CIRCUIT_STATUS, async (_event, { providerType }: { providerType: string }) => {
    return aiGateway.getCircuitBreakerStatus(providerType as AIProviderType);
  });

  ipcMain.handle(IpcChannel.AI_BIND_TASK_TYPE, async (_event, params: {
    taskType: 'text' | 'image' | 'video' | 'voice';
    providerId: string;
  }) => {
    try {
      await aiGateway.bindTaskType(params.taskType, params.providerId);
      return { success: true };
    } catch (error) {
      log.error('Failed to bind task type:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.AI_GET_TASK_TYPE_BINDINGS, async () => {
    const bindings = aiGateway.getTaskTypeBindings();
    const result: Record<string, { id: string; name: string; type: string; models: string[] }> = {};
    for (const [taskType, provider] of bindings) {
      result[taskType] = {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        models: provider.models,
      };
    }
    return result;
  });

  ipcMain.handle(IpcChannel.AI_GET_TASK_AI_CONFIGS, async () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM task_ai_configs').all() as TaskAIConfigRow[];
    const result: Record<string, { baseUrl: string; hasApiKey: boolean; model: string }> = {};
    for (const row of rows) {
      const hasApiKey = row.api_key === '[ENCRYPTED]';
      result[row.task_type] = {
        baseUrl: row.base_url || '',
        hasApiKey,
        model: row.model || '',
      };
    }
    return result;
  });

  ipcMain.handle(IpcChannel.AI_SAVE_TASK_AI_CONFIG, async (_event, params: { taskType: string; config: { baseUrl: string; apiKey: string; model: string } }) => {
    const db = getDb();
    const { taskType, config } = params;
    if (config.apiKey) {
      await aiKeyManager.storeAPIKey(`task:${taskType}`, config.apiKey);
    }
    db.prepare('DELETE FROM task_ai_configs WHERE task_type = ?').run(taskType);
    db.prepare(`
      INSERT INTO task_ai_configs (task_type, base_url, api_key, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(taskType, config.baseUrl, '[ENCRYPTED]', config.model, Date.now(), Date.now());
    return { success: true };
  });

  ipcMain.handle(IpcChannel.AI_ANALYZE_FAILURE, async (_event, { taskId }: { taskId: string }) => {
    const task = taskQueue.get(taskId);
    if (!task) return { success: false, error: '任务不存在' };
    await analyzeNow('failure', task.platform, taskId);
    return { success: true };
  });

  ipcMain.handle(IpcChannel.AI_DAILY_BRIEFING, async (_event, { platform }: { platform: Platform }) => {
    const result = await dailyBriefing(platform);
    return { success: true, result };
  });

  ipcMain.handle(IpcChannel.AI_HOT_TOPICS, async (_event, { platform }: { platform: Platform }) => {
    const result = await checkHotTopics(platform);
    return { success: true, result };
  });

  ipcMain.handle(IpcChannel.AI_ANALYZE_NOW, async (_event, { type, platform, taskId }: { type: AITriggerType; platform: Platform; taskId?: string }) => {
    await analyzeNow(type, platform, taskId);
    return { success: true };
  });
}
