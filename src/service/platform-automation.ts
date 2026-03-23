import { Page } from 'playwright';
import { createPage, screenshot } from './platform-launcher.js';
import { selectorManager, DEFAULT_SELECTORS } from './selector-versioning.js';
import { taskQueue } from './queue.js';
import { rateLimiter } from './rate-limiter.js';
import type { Platform, Task, ExecutionContext } from '../shared/types.js';
import log from 'electron-log';

export interface AutomationResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  selectorUsed?: string;
}

/**
 * 平台自动化执行器
 * 负责执行具体的浏览器自动化任务
 */
export class PlatformAutomation {
  private page: Page | null = null;
  private platform: Platform | null = null;

  /**
   * 执行发布任务
   */
  async executePublishTask(task: Task): Promise<AutomationResult> {
    const platform = task.platform;
    const payload = task.payload as {
      title?: string;
      content?: string;
      images?: string[];
      video?: string;
      accountId: string;
    };

    // 检查限流
    const limitCheck = rateLimiter.check(platform);
    if (!limitCheck.allowed) {
      log.warn(`平台 ${platform} 触发限流，需等待 ${limitCheck.waitMs}ms`);
      return { success: false, error: `Rate limit: wait ${limitCheck.waitMs}ms` };
    }

    // 获取检查点（用于崩溃恢复）
    const checkpoint = taskQueue.getCheckpoint(task.id);
    const startStep = checkpoint?.step ?? 'navigate';

    try {
      await this.ensurePage(platform);

      // 步骤执行
      switch (startStep) {
        case 'navigate':
          await this.navigateToPublish(platform);
          taskQueue.saveCheckpoint({
            taskId: task.id,
            step: 'login_check',
            payload,
            createdAt: Date.now(),
          });
          // falls through

        case 'login_check':
          const isLoggedIn = await this.checkLoginState(platform);
          if (!isLoggedIn) {
            return { success: false, error: 'Not logged in' };
          }
          taskQueue.saveCheckpoint({
            taskId: task.id,
            step: 'fill_form',
            payload,
            createdAt: Date.now(),
          });
          // falls through

        case 'fill_form':
          await this.fillPublishForm(platform, payload);
          taskQueue.saveCheckpoint({
            taskId: task.id,
            step: 'confirm_publish',
            payload,
            createdAt: Date.now(),
          });
          // falls through

        case 'confirm_publish':
          await this.confirmPublish(platform);
          rateLimiter.acquire(platform);
          taskQueue.clearCheckpoint(task.id);
          break;
      }

      selectorManager.reportSuccess(platform, 'publish_button');

      return {
        success: true,
        data: { published: true, url: `https://${platform}.com/item/xxx` },
      };
    } catch (error) {
      const err = error as Error;

      // 报告选择器失败
      const lastSelector = this.getLastFailedSelector(err.message);
      if (lastSelector) {
        selectorManager.reportFailure(platform, lastSelector);
      }

      // 保存检查点以便恢复
      taskQueue.saveCheckpoint({
        taskId: task.id,
        step: startStep,
        payload,
        browserState: await this.serializePageState(),
        createdAt: Date.now(),
      });

      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 确保页面已创建
   */
  private async ensurePage(platform: Platform): Promise<void> {
    if (!this.page || this.platform !== platform) {
      this.page = await createPage(platform);
      this.platform = platform;
    }
  }

  /**
   * 导航到发布页面
   */
  private async navigateToPublish(platform: Platform): Promise<void> {
    const urls: Record<Platform, string> = {
      douyin: 'https://creator.douyin.com/content/upload',
      kuaishou: 'https://cp.kuaishou.com/interaction/long-video/upload',
      xiaohongshu: 'https://creator.xiaohongshu.com/publish',
    };

    log.info(`导航到发布页: ${urls[platform]}`);
    await this.page!.goto(urls[platform], { waitUntil: 'networkidle' });
  }

  /**
   * 检查登录状态
   */
  private async checkLoginState(platform: Platform): Promise<boolean> {
    const selector = selectorManager.get(platform, 'login_state');

    if (!selector) {
      // 使用默认选择器注册
      const defaults = DEFAULT_SELECTORS[platform];
      if (defaults.login_state) {
        selectorManager.register({
          platform,
          selectorKey: 'login_state',
          value: defaults.login_state.css,
          type: 'css',
        });
      }
    }

    try {
      if (selector) {
        await this.page!.waitForSelector(selector.value, { timeout: 5000 });
        return true;
      }
    } catch {
      // 可能在登录页
      const loginSelector = selectorManager.get(platform, 'login_button');
      if (loginSelector) {
        try {
          await this.page!.waitForSelector(loginSelector.value, { timeout: 3000 });
          return false;
        } catch {
          // 未知状态
        }
      }
    }

    return false;
  }

  /**
   * 填写发布表单
   */
  private async fillPublishForm(platform: Platform, payload: Record<string, unknown>): Promise<void> {
    // 填写标题
    const titleSelector = selectorManager.get(platform, 'title_input');
    if (titleSelector && payload.title) {
      await this.page!.fill(titleSelector.value, payload.title as string);
      selectorManager.reportSuccess(platform, 'title_input');
    }

    // 填写内容
    const contentSelector = selectorManager.get(platform, 'content_input');
    if (contentSelector && payload.content) {
      await this.page!.fill(contentSelector.value, payload.content as string);
      selectorManager.reportSuccess(platform, 'content_input');
    }

    log.info(`表单已填写: ${platform}`);
  }

  /**
   * 确认发布
   */
  private async confirmPublish(platform: Platform): Promise<void> {
    const publishSelector = selectorManager.get(platform, 'publish_confirm');
    if (publishSelector) {
      await this.page!.click(publishSelector.value);
      // 等待发布完成
      await this.page!.waitForTimeout(3000);
      selectorManager.reportSuccess(platform, 'publish_confirm');
      log.info(`发布确认: ${platform}`);
    }
  }

  /**
   * 序列化页面状态（用于崩溃恢复）
   */
  private async serializePageState(): Promise<string> {
    if (!this.page) return '{}';

    try {
      const state = await this.page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        scrollY: window.scrollY,
      }));
      return JSON.stringify(state);
    } catch {
      return '{}';
    }
  }

  /**
   * 从错误消息中提取失败的选择器 key
   */
  private getLastFailedSelector(errorMsg: string): string | null {
    const selectors = [
      'title_input', 'content_input', 'publish_button',
      'publish_confirm', 'login_state', 'login_button',
    ];

    for (const sel of selectors) {
      if (errorMsg.includes(sel)) {
        return sel;
      }
    }

    // 尝试从 selector_manager 获取当前活跃选择器
    return null;
  }

  /**
   * 关闭当前页面
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
      this.platform = null;
    }
  }
}

export const platformAutomation = new PlatformAutomation();
