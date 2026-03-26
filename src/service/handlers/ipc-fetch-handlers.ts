/**
 * Fetch IPC Handlers — 数据获取相关的 IPC handler
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { createFetcher, createAllFetchers } from '../data-fetcher/index.js';
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
      if (platform) {
        const fetcher = createFetcher(platform);
        try {
          const result = await withTimeout(fetcher.fetchHotTopics({ limit: 10 }), IpcChannel.FETCH_HOT_TOPICS);
          return result;
        } finally {
          await fetcher.close();
        }
      } else {
        const fetchers = createAllFetchers();
        const allTopics: { heat: number }[] = [];
        const errors: string[] = [];

        for (const fetcher of fetchers) {
          try {
            const result = await withTimeout(fetcher.fetchHotTopics({ limit: 10 }), IpcChannel.FETCH_HOT_TOPICS);
            allTopics.push(...(result.topics ?? []));
            if (result.error) {
              errors.push(`${(fetcher as unknown as { platform: string }).platform}: ${result.error}`);
            }
          } catch (e) {
            errors.push(`${(fetcher as unknown as { platform: string }).platform}: ${(e as Error).message}`);
          } finally {
            await fetcher.close();
          }
        }

        allTopics.sort((a: { heat: number }, b: { heat: number }) => b.heat - a.heat);

        return {
          topics: allTopics,
          source: 'all' as const,
          fetchedAt: Date.now(),
          error: errors.length > 0 ? errors.join('; ') : undefined,
        };
      }
    } catch (error) {
      log.error('[IPC] fetch:hot-topics failed:', error);
      return { topics: [], source: platform ?? 'all', fetchedAt: Date.now(), error: (error as Error).message };
    }
  });
}
