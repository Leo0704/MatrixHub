import { ipcMain } from 'electron';
import { IpcChannel } from '../../shared/ipc-channels.js';
import log from 'electron-log';

/**
 * Automation confirm handler — 人工确认节点
 * 注意：spec 要求"取消所有人工确认节点"，此 handler 目前是空实现
 * 未来删除确认节点时一并移除
 */
export function registerAutomationHandlers(): void {
  ipcMain.handle(IpcChannel.AUTOMATION_CONFIRM_RESPONSE, async (_event, result: { confirmed: boolean; dontAskAgain: boolean }) => {
    log.info('[IPC] automation:confirm-response', result);
    // TODO: spec 要求取消人工确认节点，此处返回 success 由调用方自行决定后续行为
    return { success: true };
  });
}
