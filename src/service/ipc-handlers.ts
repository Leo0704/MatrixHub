import { ipcMain, BrowserWindow, app } from 'electron';
import log from 'electron-log';
import { taskQueue } from './queue.js';
import { accountManager, credentialManager, aiKeyManager } from './credential-manager.js';
import { rateLimiter } from './rate-limiter.js';
import { aiGateway } from './ai-gateway.js';
import { selectorManager } from './selector-versioning.js';
import { monitoringService } from './monitoring.js';
import { closeAllBrowsers } from './platform-launcher.js';
import { getDb } from './db.js';
import { runtimeConfig } from './config/runtime-config.js';
import type { Task, TaskFilter, Platform, AIRequest, AIIterationRequest, AITriggerType } from '../shared/types.js';
import type { AIProviderType } from './ai-gateway.js';
import { dailyBriefing, checkHotTopics, analyzeNow } from './ai-director.js';
import { registerGroupHandlers } from './handlers/group-handlers.js';
import { z } from 'zod';

// 数据库行类型定义
interface TaskAIConfigRow {
  task_type: string;
  base_url: string;
  api_key: string;
  model: string;
  created_at: number;
  updated_at: number;
}

interface SelectorVersionRow {
  platform: string;
  selector_key: string;
  selector_value: string;
  is_active: number;
  version: number;
  success_rate: number;
  failure_count: number;
  updated_at: number;
}

// ============ 输入验证 Schema ============

const taskCreateSchema = z.object({
  type: z.enum(['publish', 'ai_generate', 'fetch', 'automation', 'page_agent']),
  platform: z.enum(['douyin', 'kuaishu', 'xiaohongshu']),
  title: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
  scheduledAt: z.number().optional(),
});

const accountUpdateSchema = z.object({
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  status: z.enum(['active', 'inactive', 'error']).optional(),
  groupId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const aiTestConnectionSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

/**
 * SSRF 防护：检查 URL 是否指向内部网络
 */
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // 只允许 HTTPS（生产环境应强制要求）
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // 阻止回环地址
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // 阻止私有 IP 地址
    const privateIpPatterns = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,              // 192.168.0.0/16
      /^169\.254\./,              //链路本地地址 (AWS 元数据)
      /^0\./,                    // 0.0.0.0/8
    ];

    if (privateIpPatterns.some(pattern => pattern.test(hostname))) {
      return false;
    }

    // 阻止 IPv6 链接本地地址
    if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return false;
    }

    // 阻止内网域名
    const blockedDomains = ['localhost', 'invalid', 'example.com'];
    if (blockedDomains.includes(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
  log.info('注册 IPC 处理器...');

  // ============ 任务相关 ============

  ipcMain.handle('task:create', async (_event, params: {
    type: string;
    platform: string;
    title: string;
    payload: Record<string, unknown>;
    scheduledAt?: number;
  }) => {
    // 输入验证
    const parsed = taskCreateSchema.safeParse(params);
    if (!parsed.success) {
      log.warn('task:create validation failed:', parsed.error.issues);
      return { success: false, error: `Invalid params: ${parsed.error.issues[0]?.message}` };
    }

    const task = taskQueue.create({
      type: parsed.data.type as Task['type'],
      platform: parsed.data.platform as Platform,
      title: parsed.data.title,
      payload: parsed.data.payload,
      scheduledAt: parsed.data.scheduledAt,
    });

    // 通知渲染进程
    broadcastToRenderers('task:created', task);

    return task;
  });

  ipcMain.handle('task:get', async (_event, { taskId }: { taskId: string }) => {
    return taskQueue.get(taskId);
  });

  ipcMain.handle('task:list', async (_event, filter: TaskFilter) => {
    return taskQueue.list(filter);
  });

  ipcMain.handle('task:cancel', async (_event, { taskId }: { taskId: string }) => {
    const task = taskQueue.cancel(taskId);
    broadcastToRenderers('task:updated', task);
    return task;
  });

  ipcMain.handle('task:retry', async (_event, { taskId }: { taskId: string }) => {
    const task = taskQueue.updateStatus(taskId, 'pending', { error: undefined });
    broadcastToRenderers('task:updated', task);
    return task;
  });

  ipcMain.handle('task:stats', async () => {
    return taskQueue.getStats();
  });

  // ============ 账号相关 ============

  ipcMain.handle('account:list', async (_event, { platform }: { platform?: Platform }) => {
    return accountManager.list({ platform });
  });

  ipcMain.handle('account:add', async (_event, params: {
    platform: Platform;
    username: string;
    displayName: string;
    avatar?: string;
    password: string;
    cookies?: string;
    tokens?: Record<string, string>;
  }) => {
    try {
      const account = await accountManager.add({
        platform: params.platform,
        username: params.username,
        displayName: params.displayName,
        avatar: params.avatar,
        password: params.password,
        cookies: params.cookies,
        tokens: params.tokens,
      });

      broadcastToRenderers('account:added', account);
      return account;
    } catch (error) {
      log.error('Failed to add account:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('account:update', async (_event, { accountId, updates }: { accountId: string; updates: any }) => {
    // 输入验证
    const parsed = accountUpdateSchema.safeParse(updates);
    if (!parsed.success) {
      log.warn('account:update validation failed:', parsed.error.issues);
      return { success: false, error: `Invalid updates: ${parsed.error.issues[0]?.message}` };
    }

    const account = accountManager.update(accountId, {
      ...parsed.data,
      // Convert null to undefined for groupId
      groupId: parsed.data.groupId ?? undefined,
    });
    broadcastToRenderers('account:updated', account);
    return account;
  });

  ipcMain.handle('account:remove', async (_event, { accountId }: { accountId: string }) => {
    accountManager.remove(accountId);
    broadcastToRenderers('account:removed', { accountId });
    return { success: true };
  });

  ipcMain.handle('account:validate', async (_event, { accountId }: { accountId: string }) => {
    return credentialManager.validateCredential(accountId);
  });

  // ============ 限流相关 ============

  ipcMain.handle('rate:status', async (_event, { platform }: { platform: Platform }) => {
    return rateLimiter.getStatus(platform);
  });

  ipcMain.handle('rate:check', async (_event, { platform }: { platform: Platform }) => {
    return rateLimiter.check(platform);
  });

  // ============ 自动化确认 ============

  ipcMain.handle('automation:confirm', async (_event, params: {
    action: string;
    platform: Platform;
    accountId?: string;
    config?: Record<string, unknown>;
  }) => {
    const { action, platform, accountId, config } = params;

    // 获取主窗口
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      log.warn('[IPC] automation:confirm - 没有主窗口');
      return false;
    }

    // 操作描述映射
    const actionLabels: Record<string, string> = {
      auto_reply: '自动回复评论',
      auto_like: '自动点赞视频',
      auto_follow: '自动关注用户',
      comment_management: '评论管理',
    };

    const actionLabel = actionLabels[action] || action;
    const platformLabels: Record<string, string> = {
      douyin: '抖音',
      kuaishou: '快手',
      xiaohongshu: '小红书',
    };
    const platformLabel = platformLabels[platform] || platform;

    // 显示确认对话框
    const result = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const confirmed = confirm('确认执行 ${actionLabel}？\\n\\n平台: ${platformLabel}${accountId ? '\\n账号: ' + accountId : ''}\\n\\n注意：自动化操作可能被平台检测到，存在账号封禁风险。');
        resolve(confirmed);
      })
    `);

    log.info(`[IPC] automation:confirm - ${action} on ${platform}, result: ${result}`);
    return result;
  });

  // ============ AI 相关 ============

  ipcMain.handle('ai:generate', async (_event, request: AIRequest) => {
    return aiGateway.generate(request);
  });

  ipcMain.handle('ai:iterate', async (_event, request: AIIterationRequest) => {
    return aiGateway.iterate(request);
  });

  ipcMain.handle('ai:providers', async () => {
    const providers: any[] = [];
    for (const [type, provider] of aiGateway.providers) {
      providers.push({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        models: provider.models,
        isDefault: provider.isDefault,
        status: provider.status,
        // 不返回 apiKey
      });
    }
    return providers;
  });

  ipcMain.handle('ai:add-provider', async (_event, params: {
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

  // 测试 AI 连接连通性
  ipcMain.handle('ai:test-connection', async (_event, params: { baseUrl: string; apiKey: string; model: string }) => {
    try {
      // 输入验证
      const parsed = aiTestConnectionSchema.safeParse(params);
      if (!parsed.success) {
        log.warn('ai:test-connection validation failed:', parsed.error.issues);
        return { success: false, error: `Invalid params: ${parsed.error.issues[0]?.message}` };
      }

      // SSRF 防护：验证 URL 不指向内部网络
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
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      if (data.error) {
        return { success: false, error: data.error.message || JSON.stringify(data.error) };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ai:circuit-status', async (_event, { providerType }: { providerType: string }) => {
    return aiGateway.getCircuitBreakerStatus(providerType as AIProviderType);
  });

  // ============ 任务类型绑定相关 ============

  ipcMain.handle('ai:bind-task-type', async (_event, params: {
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

  ipcMain.handle('ai:get-task-type-bindings', async () => {
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

  // 获取任务类型 AI 配置（不返回 apiKey，只返回是否有配置）
  ipcMain.handle('ai:get-task-ai-configs', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM task_ai_configs').all() as TaskAIConfigRow[];
    const result: Record<string, { baseUrl: string; hasApiKey: boolean; model: string }> = {};
    for (const row of rows) {
      // API Key 存储在加密文件中，数据库中只存标记 '[ENCRYPTED]'
      const hasApiKey = row.api_key === '[ENCRYPTED]';
      result[row.task_type] = {
        baseUrl: row.base_url || '',
        hasApiKey,
        model: row.model || '',
      };
    }
    return result;
  });

  // 保存任务类型 AI 配置（API Key 使用 safeStorage 加密存储）
  ipcMain.handle('ai:save-task-ai-config', async (_event, params: { taskType: string; config: { baseUrl: string; apiKey: string; model: string } }) => {
    const db = getDb();
    const { taskType, config } = params;

    // 使用 aiKeyManager 加密存储 API Key
    if (config.apiKey) {
      await aiKeyManager.storeAPIKey(`task:${taskType}`, config.apiKey);
    }

    // 先删除旧的
    db.prepare('DELETE FROM task_ai_configs WHERE task_type = ?').run(taskType);

    // 插入新的（API Key 不存储在数据库中，只存储标记）
    db.prepare(`
      INSERT INTO task_ai_configs (task_type, base_url, api_key, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(taskType, config.baseUrl, '[ENCRYPTED]', config.model, Date.now(), Date.now());

    return { success: true };
  });

  // ============ 选择器相关 ============

  ipcMain.handle('selector:get', async (_event, { platform, selectorKey }: { platform: Platform; selectorKey: string }) => {
    return selectorManager.get(platform, selectorKey);
  });

  ipcMain.handle('selector:list', async (_event, { platform }: { platform: Platform }) => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM selector_versions
      WHERE platform = ? AND is_active = 1
      ORDER BY selector_key, version DESC
    `).all(platform) as SelectorVersionRow[];

    // 按 selector_key 分组，只取最新版本
    interface SelectorInfo {
      selectorKey: string;
      value: string;
      type: 'xpath' | 'css';
      version: number;
      successRate: number;
      failureCount: number;
      updatedAt: number;
    }
    const grouped = new Map<string, SelectorInfo>();
    for (const row of rows) {
      if (!grouped.has(row.selector_key)) {
        grouped.set(row.selector_key, {
          selectorKey: row.selector_key,
          value: row.selector_value,
          type: row.selector_value.startsWith('//') ? 'xpath' : 'css',
          version: row.version,
          successRate: row.success_rate,
          failureCount: row.failure_count,
          updatedAt: row.updated_at,
        });
      }
    }

    return Array.from(grouped.values());
  });

  ipcMain.handle('selector:get-versions', async (_event, { platform, selectorKey }: { platform: Platform; selectorKey: string }) => {
    return selectorManager.getAllVersions(platform, selectorKey);
  });

  ipcMain.handle('selector:register', async (_event, params: {
    platform: Platform;
    selectorKey: string;
    value: string;
    type?: 'css' | 'xpath' | 'text' | 'aria';
  }) => {
    return selectorManager.register(params);
  });

  ipcMain.handle('selector:report-success', async (_event, { platform, selectorKey }: { platform: Platform; selectorKey: string }) => {
    selectorManager.reportSuccess(platform, selectorKey);
    return { success: true };
  });

  ipcMain.handle('selector:report-failure', async (_event, { platform, selectorKey }: { platform: Platform; selectorKey: string }) => {
    selectorManager.reportFailure(platform, selectorKey);
    return { success: true };
  });

  // ============ 用户同意相关 ============

  ipcMain.handle('get-consent-required', async () => {
    const { ConsentManager } = await import('./consent-manager.js');
    const manager = new ConsentManager();
    return manager.isConsentRequired();
  });

  ipcMain.handle('grant-consent', async () => {
    const { ConsentManager } = await import('./consent-manager.js');
    const manager = new ConsentManager();
    await manager.grantConsent();
  });

  // ============ 系统相关 ============

  ipcMain.handle('system:stats', async () => {
    const db = getDb();
    return {
      tasks: taskQueue.getStats(),
      dbPath: app.getPath('userData'),
    };
  });

  ipcMain.handle('system:open-devtools', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.openDevTools();
    }
    return { success: true };
  });

  // ============ 监控相关 ============

  ipcMain.handle('monitoring:health', async () => {
    return monitoringService.healthCheck();
  });

  ipcMain.handle('monitoring:alerts', async (_event, options?: { limit?: number; unacknowledgedOnly?: boolean }) => {
    return monitoringService.getAlerts(options);
  });

  ipcMain.handle('monitoring:acknowledge-alert', async (_event, { alertId }: { alertId: string }) => {
    monitoringService.acknowledgeAlert(alertId);
    return { success: true };
  });

  ipcMain.handle('monitoring:dashboard', async () => {
    return monitoringService.getDashboardData();
  });

  ipcMain.handle('monitoring:metrics', async (_event, { name, from, to, limit }: { name: string; from?: number; to?: number; limit?: number }) => {
    return monitoringService.getMetrics(name, { from, to, limit });
  });

  ipcMain.handle('monitoring:collect', async () => {
    await monitoringService.collectMetrics();
    return { success: true };
  });

  // ============ AI 驱动 ============

  // 注意：这里不用 top-level import analyzeFailure，
  // 因为 taskQueue 已在文件顶部导入，会造成循环依赖
  ipcMain.handle('ai:analyze-failure', async (_event, { taskId }: { taskId: string }) => {
    // 动态 import 避免循环依赖
    const { taskQueue } = await import('./queue.js')
    const task = taskQueue.get(taskId)
    if (!task) return { success: false, error: '任务不存在' }
    const { analyzeFailure } = await import('./ai-director.js')
    await analyzeFailure(task)
    return { success: true }
  })

  ipcMain.handle('ai:daily-briefing', async (_event, { platform }: { platform: Platform }) => {
    const result = await dailyBriefing(platform)
    return { success: true, result }
  })

  ipcMain.handle('ai:hot-topics', async (_event, { platform }: { platform: Platform }) => {
    const result = await checkHotTopics(platform)
    return { success: true, result }
  })

  ipcMain.handle('ai:analyze-now', async (_event, { type, platform, taskId }: { type: AITriggerType; platform: Platform; taskId?: string }) => {
    await analyzeNow(type, platform, taskId)
    return { success: true }
  })

  // ============ 配置相关 ============

  // 获取运行时配置
  ipcMain.handle('config:get', async () => {
    return runtimeConfig.get();
  });

  // 更新配置项
  ipcMain.handle('config:update', async (_event, { key, value }: { key: string; value: unknown }) => {
    try {
      runtimeConfig.update(key as any, value);
      return { success: true };
    } catch (error) {
      log.error('Failed to update config:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 重置配置为默认值
  ipcMain.handle('config:reset', async () => {
    try {
      runtimeConfig.resetToDefaults();
      return { success: true };
    } catch (error) {
      log.error('Failed to reset config:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 重新加载配置（从数据库）
  ipcMain.handle('config:reload', async () => {
    try {
      return runtimeConfig.reload();
    } catch (error) {
      log.error('Failed to reload config:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // ============ 分组相关 ============
  registerGroupHandlers(ipcMain);

  // ============ 设置相关 ============

  ipcMain.handle('get-settings', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return rows.reduce((acc, row) => {
      acc[row.key] = JSON.parse(row.value);
      return acc;
    }, {} as Record<string, unknown>);
  });

  ipcMain.handle('save-settings', async (_, settings: Record<string, unknown>) => {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, JSON.stringify(value));
      }
    });
    tx();
  });

  log.info('IPC 处理器注册完成');
}

/**
 * 向所有渲染进程广播消息
 */
export function broadcastToRenderers(channel: string, data: any): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(channel, data);
  });
}
