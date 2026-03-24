/**
 * 页面操作辅助函数
 */
import type { Page } from 'playwright';
import type { Platform } from '../../shared/types.js';
import { getBaseUrl, getPublishSelectors, type SelectorItem } from '../config/selectors.js';
import log from 'electron-log';

// ============ 随机延迟 ============

/**
 * 随机延迟（模拟真人操作，降低被检测风险）
 */
export async function randomDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

// ============ 导航 ============

/**
 * 导航到指定页面
 */
export async function navigateTo(page: Page, platform: Platform, path: string): Promise<void> {
  const baseUrl = getBaseUrl(platform);
  const url = `${baseUrl}${path}`;
  log.info(`[Service] 导航到: ${url}`);
  await randomDelay(500, 1500);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await randomDelay(2000, 4000);
}

/**
 * 导航到发布页
 */
export async function navigateToPublish(page: Page, platform: Platform): Promise<void> {
  const { getPublishUrl } = await import('../config/selectors.js');
  const url = getPublishUrl(platform);
  log.info(`[Service] 导航到发布页: ${url}`);

  await randomDelay(500, 1500);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await randomDelay(2000, 4000);
}

// ============ 选择器操作 ============

/**
 * 尝试多个选择器（依次尝试直到成功）
 */
export async function trySelectors(
  page: Page,
  selectors: SelectorItem[],
  action: 'click' | 'fill' | 'wait',
  value?: string
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      if (action === 'fill' && value !== undefined) {
        await page.fill(selector.value, value);
      } else if (action === 'click') {
        await page.click(selector.value);
      } else if (action === 'wait') {
        await page.waitForSelector(selector.value, { timeout: 5000 });
      }
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

// ============ 登录状态检查 ============

/**
 * 检查登录状态
 */
export async function checkLoginState(page: Page, platform: Platform): Promise<boolean> {
  const selectorList = getPublishSelectors(platform, 'login_state');

  // 先检查是否在登录页
  const loginSelectors = ['button:has-text("登录")', '[class*="login"]', 'input[type="text"]'];
  for (const sel of loginSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      log.info(`[Service] 检测到未登录状态: ${platform}`);
      return false;
    } catch {
      // 不在登录页，继续检查
    }
  }

  // 检查是否已登录（等待用户信息元素）
  for (const sel of selectorList) {
    try {
      await page.waitForSelector(sel.value, { timeout: 5000 });
      log.info(`[Service] 检测到已登录: ${platform}`);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

// ============ 表单填写 ============

interface PublishPayload {
  title?: string;
  content?: string;
  video?: string;
  images?: string[];
  tags?: string;
}

/**
 * 填写发布表单
 */
export async function fillPublishForm(
  page: Page,
  platform: Platform,
  payload: PublishPayload
): Promise<void> {
  log.info(`[Service] 填写发布表单: ${platform}`);

  // 1. 填写标题
  if (payload.title) {
    const titleSelectors = getPublishSelectors(platform, 'title_input');
    const filled = await trySelectors(page, titleSelectors, 'fill', payload.title);
    if (filled) {
      log.info(`[Service] 标题已填写`);
      await randomDelay(300, 800);
    } else {
      log.warn(`[Service] 标题选择器全部失败`);
    }
  }

  // 2. 填写内容
  if (payload.content) {
    const contentSelectors = getPublishSelectors(platform, 'content_input');
    const filled = await trySelectors(page, contentSelectors, 'fill', payload.content);
    if (filled) {
      log.info(`[Service] 内容已填写`);
      await randomDelay(300, 800);
    } else {
      log.warn(`[Service] 内容选择器全部失败`);
    }
  }

  // 3. 上传视频
  if (payload.video) {
    const videoSelectors = getPublishSelectors(platform, 'video_input');
    for (const sel of videoSelectors) {
      try {
        await page.setInputFiles(sel.value, payload.video);
        log.info(`[Service] 视频已上传: ${payload.video}`);
        await randomDelay(2000, 4000);
        break;
      } catch {
        continue;
      }
    }
  }

  // 4. 上传图片
  if (payload.images && Array.isArray(payload.images)) {
    const imageSelectors = getPublishSelectors(platform, 'image_input') ||
      getPublishSelectors(platform, 'video_input');

    for (const imagePath of payload.images) {
      for (const sel of imageSelectors) {
        try {
          await page.setInputFiles(sel.value, imagePath);
          log.info(`[Service] 图片已上传: ${imagePath}`);
          await randomDelay(500, 1000);
          break;
        } catch {
          continue;
        }
      }
    }
  }

  // 5. 填写标签
  if (payload.tags && typeof payload.tags === 'string') {
    const tagSelectors = ['[placeholder*="标签"]', '[placeholder*="话题"]', 'input[class*="tag"]'];
    for (const sel of tagSelectors) {
      try {
        await page.fill(sel, payload.tags);
        await page.keyboard.press('Enter');
        log.info(`[Service] 标签已添加: ${payload.tags}`);
        break;
      } catch {
        continue;
      }
    }
  }
}

// ============ 发布确认 ============

/**
 * 确认发布
 */
export async function confirmPublish(page: Page, platform: Platform): Promise<void> {
  log.info(`[Service] 确认发布: ${platform}`);

  const publishSelectors = getPublishSelectors(platform, 'publish_confirm');

  // 滚动到页面底部
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await randomDelay(500, 1000);

  // 点击发布按钮
  const clicked = await trySelectors(page, publishSelectors, 'click');
  if (clicked) {
    log.info(`[Service] 发布按钮已点击`);
    await randomDelay(3000, 5000);

    // 检查错误提示
    const errorSelectors = ['[class*="error"]', '[class*="fail"]', '.toast-error'];
    for (const sel of errorSelectors) {
      const errorEl = await page.$(sel);
      if (errorEl) {
        const errorText = await errorEl.textContent();
        throw new Error(`发布失败: ${errorText}`);
      }
    }
  } else {
    throw new Error('发布按钮选择器全部失败');
  }
}
