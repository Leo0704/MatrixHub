/**
 * System IPC Handlers — 系统相关的 IPC handler
 */
import { ipcMain, BrowserWindow, app } from 'electron';
import { taskQueue } from '../queue.js';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerSystemHandlers(): void {
  ipcMain.handle(IpcChannel.SYSTEM_STATS, async () => {
    return {
      tasks: taskQueue.getStats(),
      dbPath: app.getPath('userData'),
    };
  });

  ipcMain.handle(IpcChannel.SYSTEM_OPEN_DEVTOOLS, async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.openDevTools();
    }
    return { success: true };
  });
}
