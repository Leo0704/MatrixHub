/**
 * Config IPC Handlers — 运行时配置相关的所有 IPC handler
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { runtimeConfig } from '../config/runtime-config.js';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerConfigHandlers(): void {
  ipcMain.handle(IpcChannel.CONFIG_GET, async () => {
    return runtimeConfig.get();
  });

  ipcMain.handle(IpcChannel.CONFIG_UPDATE, async (_event, { key, value }: { key: string; value: unknown }) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runtimeConfig.update(key as any, value as any);
      return { success: true };
    } catch (error) {
      log.error('Failed to update config:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.CONFIG_RESET, async () => {
    try {
      runtimeConfig.resetToDefaults();
      return { success: true };
    } catch (error) {
      log.error('Failed to reset config:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.CONFIG_RELOAD, async () => {
    try {
      return runtimeConfig.reload();
    } catch (error) {
      log.error('Failed to reload config:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
