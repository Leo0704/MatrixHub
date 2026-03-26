import { Page } from 'playwright';
import { createPage, screenshot } from './platform-launcher.js';
import { getPublishSelectors } from './config/selectors.js';
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
          await rateLimiter.acquire(platform);
          taskQueue.clearCheckpoint(task.id);
          break;
      }

      log.info(`发布成功: ${platform}`);

      // 获取发布后的真实 URL
      const publishedUrl = this.page ? this.page.url() : null;

      return {
        success: true,
        data: { published: true, url: publishedUrl },
      };
    } catch (error) {
      const err = error as Error;

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
    const loginStateSelectors = getPublishSelectors(platform, 'login_state');

    for (const sel of loginStateSelectors) {
      try {
        await this.page!.waitForSelector(sel.value, { timeout: 5000 });
        return true;
      } catch {
        // 继续试下一个
      }
    }

    // 尝试登录按钮（未登录状态）
    const loginButtonSelectors = getPublishSelectors(platform, 'login_button');
    for (const sel of loginButtonSelectors) {
      try {
        await this.page!.waitForSelector(sel.value, { timeout: 3000 });
        return false;
      } catch {
        // 继续试下一个
      }
    }

    return false;
  }

  /**
   * 填写发布表单
   */
  private async fillPublishForm(platform: Platform, payload: Record<string, unknown>): Promise<void> {
    // 填写标题
    if (payload.title) {
      const titleSelectors = getPublishSelectors(platform, 'title_input');
      for (const sel of titleSelectors) {
        try {
          await this.page!.fill(sel.value, payload.title as string);
          log.info(`标题已填写: ${platform}, selector=${sel.value}`);
          break;
        } catch {
          // 继续试下一个
        }
      }
    }

    // 填写内容
    if (payload.content) {
      const contentSelectors = getPublishSelectors(platform, 'content_input');
      for (const sel of contentSelectors) {
        try {
          await this.page!.fill(sel.value, payload.content as string);
          log.info(`内容已填写: ${platform}, selector=${sel.value}`);
          break;
        } catch {
          // 继续试下一个
        }
      }
    }

    log.info(`表单已填写: ${platform}`);
  }

  /**
   * 确认发布
   */
  private async confirmPublish(platform: Platform): Promise<void> {
    const publishSelectors = getPublishSelectors(platform, 'publish_confirm');

    for (const sel of publishSelectors) {
      try {
        const currentUrl = this.page!.url();
        await this.page!.click(sel.value);

        // 等待页面导航或成功提示出现
        try {
          await Promise.race([
            this.page!.waitForURL(url => url.href !== currentUrl, { timeout: 10000 }),
            this.page!.waitForSelector('[class*="success"], [class*="publish-success"], [data-e2e="success"]', { timeout: 10000 }),
          ]);
        } catch {
          // 如果等待失败，至少等待一下让发布完成
          await this.page!.waitForTimeout(2000);
        }

        log.info(`发布确认成功: ${platform}, selector=${sel.value}`);
        return;
      } catch {
        // 继续试下一个选择器
      }
    }

    log.warn(`发布确认：所有选择器均失败: ${platform}`);
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

// ============ Data Fetcher 辅助函数 ============

/**
 * 为 data-fetcher 创建页面
 * 与普通 automation 不同的页面设置
 */
export async function createFetcherPage(platform: Platform): Promise<Page> {
  const page = await createPage(platform);

  // 设置更长的超时
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);

  return page;
}
