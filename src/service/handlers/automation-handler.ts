/**
 * 自动化任务处理器
 */
import type { Page } from 'playwright';
import type { Platform, Task } from '../../shared/types.js';
import { navigateTo, randomDelay, checkLoginState, humanClick, humanScroll } from '../utils/page-helpers.js';
import { getAutoSelectors, AUTOMATION_PATHS } from '../config/selectors.js';
import { markPageLoggedIn } from '../platform-launcher.js';
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

  // 标记页面为已登录状态
  if (payload.accountId) {
    markPageLoggedIn(page, payload.accountId);
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
    // 随机延迟 + 偶尔长暂停（阅读内容）
    const baseDelay = 800 + Math.random() * 1500;
    await randomDelay(Math.round(baseDelay), Math.round(baseDelay + 500));
    await humanScroll(page, 200 + Math.random() * 200);
    await randomDelay(300, 1200);

    // 每5次操作模拟一次"阅读"暂停
    if (i > 0 && i % 5 === 0) {
      await randomDelay(3000, 6000);
    }

    for (const sel of commentInputSelectors) {
      try {
        await humanClick(page, sel.value);
        await randomDelay(200, 800);
        await page.fill(sel.value, replyText);
        await randomDelay(150, 600);
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
    // 随机延迟
    await randomDelay(1200, 3500);
    await humanScroll(page, 300 + Math.random() * 200);
    await randomDelay(600, 1800);

    // 每5次操作模拟一次"阅读"暂停
    if (i > 0 && i % 5 === 0) {
      await randomDelay(3000, 7000);
    }

    for (const sel of likeSelectors) {
      try {
        await humanClick(page, sel.value);
        liked++;
        log.info(`[Service] 已点赞第 ${liked} 个内容`);
        await randomDelay(400, 1200);
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
    // 随机延迟
    await randomDelay(1200, 3500);
    await humanScroll(page, 250 + Math.random() * 150);
    await randomDelay(400, 1200);

    // 每5次操作模拟一次"阅读"暂停
    if (i > 0 && i % 5 === 0) {
      await randomDelay(3000, 7000);
    }

    for (const sel of followSelectors) {
      try {
        const btn = await page.$(sel.value);
        if (btn) {
          const text = await btn.textContent();
          if (text?.includes('已关注')) {
            continue;
          }
        }
        await humanClick(page, sel.value);
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
    await humanScroll(page, 200);
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
