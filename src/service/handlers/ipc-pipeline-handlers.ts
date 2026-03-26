/**
 * Pipeline IPC Handlers — Pipeline 已被 Campaign 取代，这些 handler 不再做实质操作
 * 保留接口兼容性，防止 IPC 调用报错
 */
import { ipcMain } from 'electron';
import { IpcChannel } from '../../shared/ipc-channels.js';

export function registerPipelineHandlers(): void {
  // Pipeline 功能已迁移到 Campaign，这些接口返回禁用状态
  ipcMain.handle(IpcChannel.PIPELINE_CREATE, async () => {
    return { success: false, error: 'Pipeline 功能已迁移到 Campaign，请使用 campaign:launch' };
  });

  ipcMain.handle(IpcChannel.PIPELINE_GET, async () => {
    return { success: false, error: 'Pipeline 功能已迁移到 Campaign' };
  });

  ipcMain.handle(IpcChannel.PIPELINE_CANCEL, async () => {
    return { success: false, error: 'Pipeline 功能已迁移到 Campaign' };
  });
}
