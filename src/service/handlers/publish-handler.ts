/**
 * 发布任务处理器
 */
import type { Page } from 'playwright';
import type { Platform, Task } from '../../shared/types.js';
import { taskQueue } from '../queue.js';
import { rateLimiter } from '../rate-limiter.js';
import { createPage } from '../platform-launcher.js';
import {
  navigateToPublish,
  checkLoginState,
  fillPublishForm,
  confirmPublish,
  randomDelay,
} from '../utils/page-helpers.js';
import log from 'electron-log';

interface PublishPayload {
  title?: string;
  content?: string;
  images?: string[];
  video?: string;
  accountId: string;
}

export async function executePublishTask(
  page: Page,
  task: Task,
  signal: AbortSignal
): Promise<void> {
  const platform = task.platform;
  const payload = task.payload as PublishPayload;

  // 检查限流
  const limitCheck = rateLimiter.check(platform);
  if (!limitCheck.allowed) {
    log.warn(`[Service] 限流等待: ${platform}, 需等待 ${limitCheck.waitMs}ms`);
    await sleep(limitCheck.waitMs!);
  }

  signal.throwIfAborted();

  const checkpoint = taskQueue.getCheckpoint(task.id);
  const startStep = checkpoint?.step ?? 'navigate';

  try {
    // 导航
    await navigateToPublish(page, platform);
    taskQueue.saveCheckpoint({
      taskId: task.id,
      step: 'login_check',
      payload,
      createdAt: Date.now(),
    });

    signal.throwIfAborted();

    // 检查登录
    const isLoggedIn = await checkLoginState(page, platform);
    if (!isLoggedIn) {
      throw new Error('账号未登录');
    }

    taskQueue.saveCheckpoint({
      taskId: task.id,
      step: 'fill_form',
      payload,
      createdAt: Date.now(),
    });

    signal.throwIfAborted();

    // 填写表单
    await fillPublishForm(page, platform, payload);

    taskQueue.saveCheckpoint({
      taskId: task.id,
      step: 'confirm_publish',
      payload,
      createdAt: Date.now(),
    });

    signal.throwIfAborted();

    // 确认发布
    await confirmPublish(page, platform);

    // 消耗限流配额
    await rateLimiter.acquire(platform);

    // 清空检查点
    taskQueue.clearCheckpoint(task.id);

    log.info(`[Service] 发布成功: ${task.id}`);

  } finally {
    await page.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
