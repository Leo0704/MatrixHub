/**
 * Pipeline IPC Handlers — Pipeline 相关的 IPC handler
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { broadcastToRenderers } from '../ipc-utils.js';
import { IpcChannel, IPC_TIMEOUT_MS } from '../../shared/ipc-channels.js';
import type { Platform } from '../../shared/types.js';

function withTimeout<T>(promise: Promise<T>, channel: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`IPC ${channel} timed out after ${IPC_TIMEOUT_MS}ms`)), IPC_TIMEOUT_MS)
    ),
  ]) as Promise<T>;
}

export function registerPipelineHandlers(): void {
  ipcMain.handle(IpcChannel.PIPELINE_CREATE, async (_event, params: {
    input: { type: 'url' | 'product_detail' | 'hot_topic'; url?: string; productDetail?: string; hotTopic?: { keyword: string; platform: Platform } };
    config: { contentType: 'image' | 'video'; imageCount?: 3 | 6 | 9; generateVoice?: boolean; autoPublish: boolean; targetAccounts: string[] };
    platform: Platform;
  }) => {
    try {
      const { createPipelineTask } = await import('../pipeline/orchestrator.js');
      const task = await withTimeout(
        createPipelineTask(params.input, params.config, params.platform),
        IpcChannel.PIPELINE_CREATE
      );
      broadcastToRenderers('pipeline:created', task);
      return { success: true, task };
    } catch (error) {
      log.error('Failed to create pipeline task:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.PIPELINE_GET, async (_event, { pipelineId }: { pipelineId: string }) => {
    const { getPipelineTask } = await import('../pipeline/orchestrator.js');
    return await withTimeout(getPipelineTask(pipelineId), IpcChannel.PIPELINE_GET);
  });

  ipcMain.handle(IpcChannel.PIPELINE_CANCEL, async (_event, { pipelineId }: { pipelineId: string }) => {
    try {
      const { cancelPipelineTask } = await import('../pipeline/orchestrator.js');
      await withTimeout(cancelPipelineTask(pipelineId), IpcChannel.PIPELINE_CANCEL);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
