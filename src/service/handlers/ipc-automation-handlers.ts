/**
 * Automation IPC Handlers — 自动化确认的 IPC handler
 */
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { IpcChannel, IPC_TIMEOUT_MS } from '../../shared/ipc-channels.js';
import type { Platform } from '../../shared/types.js';

const AUTOMATION_CONFIRM_TIMEOUT = 60000;

export function registerAutomationHandlers(): void {
  ipcMain.handle(IpcChannel.AUTOMATION_CONFIRM, async (_event, params: {
    action: string;
    platform: Platform;
    accountId?: string;
    config?: Record<string, unknown>;
  }) => {
    const { action, platform, accountId } = params;

    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      log.warn('[IPC] automation:confirm - 没有主窗口');
      return { confirmed: false, dontAskAgain: false };
    }

    const actionLabels: Record<string, string> = {
      auto_reply: '自动回复评论',
      comment_management: '评论管理',
    };
    const actionLabel = actionLabels[action] || action;
    const platformLabels: Record<string, string> = {
      douyin: '抖音',
      kuaishou: '快手',
      xiaohongshu: '小红书',
    };
    const platformLabel = platformLabels[platform] || platform;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log.warn('[IPC] automation:confirm - 超时');
        resolve({ confirmed: false, dontAskAgain: false });
      }, AUTOMATION_CONFIRM_TIMEOUT);

      ipcMain.once('automation:confirm-response', (_e, result: { confirmed: boolean; dontAskAgain: boolean }) => {
        clearTimeout(timeout);
        resolve(result);
      });

      win.webContents.send('automation:confirm-request', {
        action,
        actionLabel,
        platform,
        platformLabel,
        accountId,
        riskMessage: '自动化操作可能被平台检测到，存在账号封禁风险。',
      });

      log.info(`[IPC] automation:confirm - 等待用户确认: ${action} on ${platform}`);
    });
  });
}
