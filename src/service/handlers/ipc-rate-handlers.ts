/**
 * Rate IPC Handlers — 限流相关的所有 IPC handler
 */
import { ipcMain } from 'electron';
import { rateLimiter } from '../rate-limiter.js';
import { IpcChannel } from '../../shared/ipc-channels.js';
import type { Platform } from '../../shared/types.js';

export function registerRateHandlers(): void {
  ipcMain.handle(IpcChannel.RATE_STATUS, async (_event, { platform }: { platform: Platform }) => {
    return rateLimiter.getStatus(platform);
  });

  ipcMain.handle(IpcChannel.RATE_CHECK, async (_event, { platform }: { platform: Platform }) => {
    return rateLimiter.check(platform);
  });

  ipcMain.handle(IpcChannel.RATE_STATUS_ALL, async () => {
    const platforms: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu'];
    const result: Record<string, ReturnType<typeof rateLimiter.getStatus>> = {};
    for (const platform of platforms) {
      result[platform] = rateLimiter.getStatus(platform);
    }
    return result;
  });
}
