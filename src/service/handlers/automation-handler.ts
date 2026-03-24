/**
 * 自动化任务处理器
 */
import type { Page } from 'playwright';
import type { Platform, Task } from '../../shared/types.js';
import { navigateTo, randomDelay, checkLoginState } from '../utils/page-helpers.js';
import { getAutoSelectors, AUTOMATION_PATHS } from '../config/selectors.js';
import log from 'electron-log';

interface AutoReplyConfig {
  keywords?: string[];
  replyText?: string;
  maxReplies?: number;
}

interface AutoLikeConfig {
  maxLikes?: number;
}

interface AutoFollowConfig {
  maxFollows?: number;
}

interface CommentManagementConfig {
  action?: 'list' | 'delete' | 'reply';
  targetId?: string;
}

type AutomationConfig = AutoReplyConfig | AutoLikeConfig | AutoFollowConfig | CommentManagementConfig;

interface AutomationPayload {
  action: 'auto_reply' | 'auto_like' | 'auto_follow' | 'comment_management';
  platform?: Platform;
  accountId?: string;
  targetId?: string;
  config?: AutomationConfig;
}

export async function executeAutomationTask(
  page: Page,
  task: Task,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const payload = task.payload as AutomationPayload;
  const platform = payload.platform!;

  log.info(`[Service] 开始执行自动化任务: ${payload.action}`);

  const isLoggedIn = await checkLoginState(page, platform);
  if (!isLoggedIn) {
    throw new Error('账号未登录或 Session 已过期');
  }

  signal.throwIfAborted();

  let result: Record<string, unknown> = {};

  switch (payload.action) {
    case 'auto_reply':
      result = await executeAutoReply(page, platform, payload);
      break;
    case 'auto_like':
      result = await executeAutoLike(page, platform, payload);
      break;
    case 'auto_follow':
      result = await executeAutoFollow(page, platform, payload);
      break;
    case 'comment_management':
      result = await executeCommentManagement(page, platform, payload);
      break;
    default:
      throw new Error(`未知自动化操作: ${payload.action}`);
  }

  log.info(`[Service] 自动化任务完成: ${payload.action}`);
  return result;
}

async function executeAutoReply(
  page: Page,
  platform: Platform,
  payload: AutomationPayload
): Promise<Record<string, unknown>> {
  const config = (payload.config as AutoReplyConfig) || {};
  const { replyText = '感谢关注！', maxReplies = 10 } = config;

  log.info(`[Service] 执行自动回复: platform=${platform}, max=${maxReplies}`);

  const paths = AUTOMATION_PATHS[platform];
  await navigateTo(page, platform, paths.self_posts);

  let processed = 0;
  let replied = 0;

  const commentSelectors = getAutoSelectors(platform, 'comment_item');
  const commentInputSelectors = getAutoSelectors(platform, 'comment_input');

  for (let i = 0; i < maxReplies && processed < maxReplies; i++) {
    await randomDelay(1000, 2000);
    await page.evaluate(() => window.scrollBy(0, 300));
    await randomDelay(500, 1000);

    for (const sel of commentInputSelectors) {
      try {
        await page.click(sel.value);
        await randomDelay(300, 600);
        await page.fill(sel.value, replyText);
        await randomDelay(200, 500);
        await page.keyboard.press('Enter');
        replied++;
        log.info(`[Service] 已回复第 ${replied} 条评论`);
        break;
      } catch {
        continue;
      }
    }
    processed++;
  }

  log.info(`[Service] 自动回复完成: 处理${processed}条，回复${replied}条`);
  return { processed, replied, platform };
}

async function executeAutoLike(
  page: Page,
  platform: Platform,
  payload: AutomationPayload
): Promise<Record<string, unknown>> {
  const config = (payload.config as AutoLikeConfig) || {};
  const { maxLikes = 20 } = config;

  log.info(`[Service] 执行自动点赞: platform=${platform}, max=${maxLikes}`);

  await navigateTo(page, platform, '/');

  let processed = 0;
  let liked = 0;

  const likeSelectors = getAutoSelectors(platform, 'video_like') || getAutoSelectors(platform, 'like_button');

  for (let i = 0; i < maxLikes; i++) {
    await randomDelay(1500, 3000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await randomDelay(800, 1500);

    for (const sel of likeSelectors) {
      try {
        await page.click(sel.value);
        liked++;
        log.info(`[Service] 已点赞第 ${liked} 个内容`);
        await randomDelay(500, 1000);
        break;
      } catch {
        continue;
      }
    }
    processed++;
  }

  log.info(`[Service] 自动点赞完成: 处理${processed}个，点赞${liked}个`);
  return { processed, liked, platform };
}

async function executeAutoFollow(
  page: Page,
  platform: Platform,
  payload: AutomationPayload
): Promise<Record<string, unknown>> {
  const config = (payload.config as AutoFollowConfig) || {};
  const { maxFollows = 10 } = config;

  log.info(`[Service] 执行自动关注: platform=${platform}, max=${maxFollows}`);

  const paths = AUTOMATION_PATHS[platform];
  await navigateTo(page, platform, paths.discovery);

  let processed = 0;
  let followed = 0;
  const followSelectors = getAutoSelectors(platform, 'follow_button');

  for (let i = 0; i < maxFollows; i++) {
    await randomDelay(1500, 3000);
    await page.evaluate(() => window.scrollBy(0, 300));
    await randomDelay(500, 1000);

    for (const sel of followSelectors) {
      try {
        const btn = await page.$(sel.value);
        if (btn) {
          const text = await btn.textContent();
          if (text?.includes('已关注')) {
            continue;
          }
        }
        await page.click(sel.value);
        followed++;
        log.info(`[Service] 已关注第 ${followed} 个用户`);
        await randomDelay(800, 1500);
        break;
      } catch {
        continue;
      }
    }
    processed++;
  }

  log.info(`[Service] 自动关注完成: 处理${processed}个，关注${followed}个`);
  return { processed, followed, platform };
}

async function executeCommentManagement(
  page: Page,
  platform: Platform,
  payload: AutomationPayload
): Promise<Record<string, unknown>> {
  const config = (payload.config as CommentManagementConfig) || {};
  const { action = 'list' } = config;

  log.info(`[Service] 执行评论管理: platform=${platform}, action=${action}`);

  const paths = AUTOMATION_PATHS[platform];
  await navigateTo(page, platform, paths.comments);
  await randomDelay(2000, 4000);

  const comments: Array<Record<string, unknown>> = [];
  const commentSelectors = getAutoSelectors(platform, 'comment_item');

  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.scrollBy(0, 200));
    await randomDelay(500, 1000);

    for (const sel of commentSelectors) {
      try {
        const items = await page.$$(sel.value);
        for (const item of items) {
          const text = await item.textContent();
          const author = await item.$eval('[class*="author"]', (el: Element) => el.textContent).catch(() => 'unknown');
          const content = await item.$eval('[class*="content"]', (el: Element) => el.textContent).catch(() => text);
          const time = await item.$eval('[class*="time"]', (el: Element) => el.textContent).catch(() => '');

          comments.push({ author, content, time, platform });
        }
        break;
      } catch {
        continue;
      }
    }
  }

  log.info(`[Service] 评论管理: 收集到 ${comments.length} 条评论`);
  return { action, comments, platform, count: comments.length };
}
