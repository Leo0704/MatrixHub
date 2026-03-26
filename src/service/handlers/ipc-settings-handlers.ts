/**
 * Settings IPC Handlers — 设置相关的 IPC handler
 */
import { ipcMain } from 'electron';
import { getDb } from '../db.js';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle(IpcChannel.GET_SETTINGS, async () => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return rows.reduce((acc, row) => {
      acc[row.key] = JSON.parse(row.value);
      return acc;
    }, {} as Record<string, unknown>);
  });

  ipcMain.handle(IpcChannel.SAVE_SETTINGS, async (_, settings: Record<string, unknown>) => {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, JSON.stringify(value));
      }
    });
    tx();
  });
}
