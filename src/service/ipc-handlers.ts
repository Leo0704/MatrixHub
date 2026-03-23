import { ipcMain, BrowserWindow, app } from 'electron';
import log from 'electron-log';
import { taskQueue } from './queue.js';
import { accountManager, credentialManager } from './credential-manager.js';
import { rateLimiter } from './rate-limiter.js';
import { aiGateway } from './ai-gateway.js';
import { selectorManager } from './selector-versioning.js';
import { monitoringService } from './monitoring.js';
import { closeAllBrowsers } from './platform-launcher.js';
import { getDb } from './db.js';
import type { TaskFilter, Platform, AIRequest } from '../shared/types.js';

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
    const task = taskQueue.create({
      type: params.type as any,
      platform: params.platform as Platform,
      title: params.title,
      payload: params.payload,
      scheduledAt: params.scheduledAt,
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
    return accountManager.list(platform);
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
    const account = accountManager.add({
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
  });

  ipcMain.handle('account:update', async (_event, { accountId, updates }: { accountId: string; updates: any }) => {
    const account = accountManager.update(accountId, updates);
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

  // ============ AI 相关 ============

  ipcMain.handle('ai:generate', async (_event, request: AIRequest) => {
    return aiGateway.generate(request);
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
        type: params.type as any,
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

  ipcMain.handle('ai:circuit-status', async (_event, { providerType }: { providerType: string }) => {
    return aiGateway.getCircuitBreakerStatus(providerType as any);
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
    `).all(platform) as any[];

    // 按 selector_key 分组，只取最新版本
    const grouped = new Map<string, any>();
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

  log.info('IPC 处理器注册完成');
}

/**
 * 向所有渲染进程广播消息
 */
function broadcastToRenderers(channel: string, data: any): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(channel, data);
  });
}
