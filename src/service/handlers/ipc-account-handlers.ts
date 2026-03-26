/**
 * Account IPC Handlers — 账号相关的所有 IPC handler
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import { accountManager, credentialManager } from '../credential-manager.js';
import { broadcastToRenderers } from '../ipc-utils.js';
import { z } from 'zod';
import { IpcChannel } from '../../shared/ipc-channels.js';
import type { Platform } from '../../shared/types.js';

const accountUpdateSchema = z.object({
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  status: z.enum(['active', 'inactive', 'error']).optional(),
  groupId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export function registerAccountHandlers(): void {
  ipcMain.handle(IpcChannel.ACCOUNT_LIST, async (_event, { platform }: { platform?: Platform }) => {
    return accountManager.list({ platform });
  });

  ipcMain.handle(IpcChannel.ACCOUNT_ADD, async (_event, params: {
    platform: Platform;
    username: string;
    displayName: string;
    avatar?: string;
    password: string;
    cookies?: string;
    tokens?: Record<string, string>;
  }) => {
    try {
      const account = await accountManager.add({
        platform: params.platform,
        username: params.username,
        displayName: params.displayName,
        avatar: params.avatar,
        password: params.password,
        cookies: params.cookies,
        tokens: params.tokens,
      });
      broadcastToRenderers('account:added', account);
      return account;
    } catch (error) {
      log.error('Failed to add account:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannel.ACCOUNT_UPDATE, async (_event, { accountId, updates }: { accountId: string; updates: unknown }) => {
    const parsed = accountUpdateSchema.safeParse(updates);
    if (!parsed.success) {
      log.warn('account:update validation failed:', parsed.error.issues);
      return { success: false, error: `Invalid updates: ${parsed.error.issues[0]?.message}` };
    }
    const account = accountManager.update(accountId, {
      ...parsed.data,
      groupId: parsed.data.groupId ?? undefined,
    });
    broadcastToRenderers('account:updated', account);
    return account;
  });

  ipcMain.handle(IpcChannel.ACCOUNT_REMOVE, async (_event, { accountId }: { accountId: string }) => {
    accountManager.remove(accountId);
    broadcastToRenderers('account:removed', { accountId });
    return { success: true };
  });

  ipcMain.handle(IpcChannel.ACCOUNT_VALIDATE, async (_event, { accountId }: { accountId: string }) => {
    return credentialManager.validateCredential(accountId);
  });
}
