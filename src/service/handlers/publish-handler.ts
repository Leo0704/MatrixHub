/**
 * 发布任务处理器
 */
import type { Page } from 'playwright';
import type { Platform, Task } from '../../shared/types.js';
import { taskQueue } from '../queue.js';
import { rateLimiter } from '../rate-limiter.js';
import { createPage, markPageLoggedIn } from '../platform-launcher.js';
import {
  navigateToPublish,
  checkLoginState,
  fillPublishForm,
  confirmPublish,
  randomDelay,
} from '../utils/page-helpers.js';
import { sleep } from '../utils/sleep.js';
import log from 'electron-log';
import { broadcastToRenderers } from '../ipc-handlers.js';

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
  const payload = task.payload as unknown as PublishPayload;

  // 检查限流（等待直到可以获得配额）
  const limitCheck = rateLimiter.check(platform);
  if (!limitCheck.allowed) {
    log.warn(`[Service] 限流等待: ${platform}, 需等待 ${limitCheck.waitMs}ms`);
    await sleep(limitCheck.waitMs!);
  }

  signal.throwIfAborted();

  // 在发布前获取配额，避免竞态条件
  const acquired = await rateLimiter.acquire(platform);
  if (!acquired) {
    // 限流器已满，将任务延迟处理
    log.warn(`[Service] 限流器已满: ${platform}，任务 ${task.id} 将重新入队`);
    throw new Error('rate_limit_exceeded');
  }

  const checkpoint = taskQueue.getCheckpoint(task.id);
  const startStep = checkpoint?.step ?? 'navigate';

  try {
    // 导航
    if (startStep === 'navigate') {
      await navigateToPublish(page, platform);
      taskQueue.saveCheckpoint({
        taskId: task.id,
        step: 'login_check',
        payload: { ...payload },
        createdAt: Date.now(),
      });
    }

    signal.throwIfAborted();

    // 检查登录
    if (startStep === 'navigate' || startStep === 'login_check') {
      const isLoggedIn = await checkLoginState(page, platform);
      if (!isLoggedIn) {
        throw new Error('账号未登录');
      }

      // 标记页面为已登录状态（这样会被保留在池中）
      markPageLoggedIn(page, payload.accountId);
    }

    if (startStep === 'navigate' || startStep === 'login_check' || startStep === 'fill_form') {
      taskQueue.saveCheckpoint({
        taskId: task.id,
        step: 'fill_form',
        payload: { ...payload },
        createdAt: Date.now(),
      });
    }

    signal.throwIfAborted();

    // 填写表单
    if (startStep === 'navigate' || startStep === 'login_check' || startStep === 'fill_form') {
      await fillPublishForm(page, platform, payload);
    }

    if (startStep === 'navigate' || startStep === 'login_check' || startStep === 'fill_form' || startStep === 'confirm_publish') {
      taskQueue.saveCheckpoint({
        taskId: task.id,
        step: 'confirm_publish',
        payload: { ...payload },
        createdAt: Date.now(),
      });
    }

    signal.throwIfAborted();

    // 确认发布
    await confirmPublish(page, platform);

    // 注意：限流配额已在发布前获取

    // 清空检查点
    taskQueue.clearCheckpoint(task.id);

    log.info(`[Service] 发布成功: ${task.id}`);

    // 设计文档第8节：重要通知 - 发布完成
    if (task.pipelineId) {
      broadcastToRenderers('notification:important', {
        type: 'publish_complete',
        title: '内容发布完成',
        message: `账号 ${payload.accountId} 已成功发布内容`,
        campaignId: task.pipelineId,
        accountId: payload.accountId,
      });
    }

  } finally {
    // 注意：不再关闭 page，而是由 service-process.ts 调用 releasePage()
    // 这样可以保持登录状态供后续任务复用
  }
}
