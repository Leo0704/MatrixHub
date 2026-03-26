/**
 * Task IPC Handlers — 任务相关的所有 IPC handler
 */
import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { taskQueue } from '../queue.js';
import { broadcastToRenderers } from '../ipc-utils.js';
import { getFieldEncryptor } from '../crypto-utils.js';
import { z } from 'zod';
import { IPC_TIMEOUT_MS, IpcChannel } from '../../shared/ipc-channels.js';
import type { Task, TaskFilter, Platform } from '../../shared/types.js';

const taskCreateSchema = z.object({
  type: z.enum(['publish', 'ai_generate', 'fetch', 'automation', 'page_agent']),
  platform: z.enum(['douyin', 'kuaishou', 'xiaohongshu']),
  title: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
  scheduledAt: z.number().optional(),
});

// ============ Task Draft Storage (Encrypted) ============

const TASK_DRAFT_FILE = 'task_draft.enc';

function getTaskDraftPath(): string {
  const dir = path.join(app.getPath('userData'), 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, TASK_DRAFT_FILE);
}

function getTaskDraft(): Record<string, unknown> | null {
  const draftPath = getTaskDraftPath();
  if (!fs.existsSync(draftPath)) {
    return null;
  }
  try {
    const encryptor = getFieldEncryptor();
    if (!encryptor || !encryptor.isAvailable()) {
      const data = fs.readFileSync(draftPath, 'utf-8');
      return JSON.parse(data);
    }
    const encrypted = fs.readFileSync(draftPath, 'utf-8');
    const decrypted = encryptor.decrypt(encrypted);
    return JSON.parse(decrypted);
  } catch (error) {
    log.error('[TaskDraft] Failed to read draft:', error);
    return null;
  }
}

function setTaskDraft(draft: Record<string, unknown> | null): void {
  const draftPath = getTaskDraftPath();
  try {
    if (draft === null) {
      if (fs.existsSync(draftPath)) {
        fs.unlinkSync(draftPath);
      }
      return;
    }
    const encryptor = getFieldEncryptor();
    const jsonData = JSON.stringify(draft);
    if (!encryptor || !encryptor.isAvailable()) {
      fs.writeFileSync(draftPath, jsonData, 'utf-8');
      return;
    }
    const encrypted = encryptor.encrypt(jsonData);
    fs.writeFileSync(draftPath, encrypted, 'utf-8');
  } catch (error) {
    log.error('[TaskDraft] Failed to save draft:', error);
  }
}

// ============ Helpers ============

function withTimeout<T>(promise: Promise<T>, channel: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`IPC ${channel} timed out after ${IPC_TIMEOUT_MS}ms`)), IPC_TIMEOUT_MS)
    ),
  ]) as Promise<T>;
}

// ============ Registration ============

export function registerTaskHandlers(): void {
  ipcMain.handle(IpcChannel.TASK_CREATE, async (_event, params: {
    type: string;
    platform: string;
    title: string;
    payload: Record<string, unknown>;
    scheduledAt?: number;
  }) => {
    const parsed = taskCreateSchema.safeParse(params);
    if (!parsed.success) {
      log.warn('task:create validation failed:', parsed.error.issues);
      return { success: false, error: `Invalid params: ${parsed.error.issues[0]?.message}` };
    }
    const task = taskQueue.create({
      type: parsed.data.type as Task['type'],
      platform: parsed.data.platform as Platform,
      title: parsed.data.title,
      payload: parsed.data.payload,
      scheduledAt: parsed.data.scheduledAt,
    });
    broadcastToRenderers('task:created', task);
    return task;
  });

  ipcMain.handle(IpcChannel.TASK_GET, async (_event, { taskId }: { taskId: string }) => {
    return withTimeout(Promise.resolve(taskQueue.get(taskId)), IpcChannel.TASK_GET);
  });

  ipcMain.handle(IpcChannel.TASK_LIST, async (_event, filter: TaskFilter) => {
    return withTimeout(Promise.resolve(taskQueue.list(filter)), IpcChannel.TASK_LIST);
  });

  ipcMain.handle(IpcChannel.TASK_CANCEL, async (_event, { taskId }: { taskId: string }) => {
    const task = taskQueue.cancel(taskId);
    broadcastToRenderers('task:updated', task);
    return task;
  });

  ipcMain.handle(IpcChannel.TASK_RETRY, async (_event, { taskId }: { taskId: string }) => {
    const task = taskQueue.updateStatus(taskId, 'pending', { error: undefined });
    broadcastToRenderers('task:updated', task);
    return task;
  });

  ipcMain.handle(IpcChannel.TASK_STATS, async () => {
    return withTimeout(Promise.resolve(taskQueue.getStats()), IpcChannel.TASK_STATS);
  });

  ipcMain.handle(IpcChannel.TASK_DRAFT_GET, async () => {
    return withTimeout(Promise.resolve(getTaskDraft()), IpcChannel.TASK_DRAFT_GET);
  });

  ipcMain.handle(IpcChannel.TASK_DRAFT_SET, async (_event, draft: Record<string, unknown> | null) => {
    setTaskDraft(draft);
    return { success: true };
  });
}
