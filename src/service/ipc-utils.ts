/**
 * IPC Utilities — 跨 handler 文件共享的工具函数
 */
import { BrowserWindow } from 'electron';

/**
 * 向所有渲染进程广播消息
 */
export function broadcastToRenderers(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(channel, data);
  });
}
