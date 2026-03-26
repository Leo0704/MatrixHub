/**
 * Export/Import IPC Handlers — 数据导出导入相关的 IPC handler
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { exportData, importData } from '../db.js';
import { getDb } from '../db.js';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerExportHandlers(): void {
  ipcMain.handle(IpcChannel.EXPORT_DATA, async () => {
    return exportData();
  });

  ipcMain.handle(IpcChannel.IMPORT_DATA, async (_, data) => {
    try {
      if (!data || typeof data !== 'object') {
        return { success: false, error: 'Invalid data format' };
      }
      if (!Array.isArray(data.accounts) || !Array.isArray(data.tasks)) {
        return { success: false, error: 'Missing required data arrays' };
      }
      importData(data);
      return { success: true };
    } catch (error) {
      log.error('Import failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.CLEAR_ALL_DATA, async () => {
    const db = getDb();
    db.exec('DELETE FROM accounts; DELETE FROM tasks; DELETE FROM account_groups;');
  });
}
