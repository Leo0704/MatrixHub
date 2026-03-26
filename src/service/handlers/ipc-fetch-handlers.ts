/**
 * Fetch IPC Handlers — 数据获取相关的 IPC handler
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { createFetcher } from '../data-fetcher/index.js';
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

export function registerFetchHandlers(): void {
  ipcMain.handle(IpcChannel.FETCH_HOT_TOPICS, async (_event, { platform }: { platform?: Platform }) => {
    try {
      // MVP 只支持抖音，忽略 platform 参数
      log.info('[IPC] 获取抖音热点话题');
      const fetcher = createFetcher('douyin');
      try {
        const result = await withTimeout(fetcher.fetchHotTopics({ limit: 10 }), IpcChannel.FETCH_HOT_TOPICS);
        return result;
      } finally {
        await fetcher.close();
      }
    } catch (error) {
      log.error('[IPC] fetch:hot-topics failed:', error);
      return { topics: [], source: 'douyin', fetchedAt: Date.now(), error: (error as Error).message };
    }
  });
}
