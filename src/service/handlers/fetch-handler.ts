/**
 * 数据获取任务处理器
 */
import type { Platform, Task } from '../../shared/types.js';
import { createFetcher } from '../data-fetcher/index.js';
import type { FetchResult } from '../data-fetcher/types.js';
import { createPage } from '../platform-launcher.js';
import { checkLoginState, navigateTo, randomDelay } from '../utils/page-helpers.js';
import log from 'electron-log';

interface FetchDataPayload {
  dataType: 'hot_topics' | 'content_stats' | 'account_stats';
  platform?: Platform;
  accountId?: string;
  dateRange?: { start: number; end: number };
}

export async function executeFetchDataTask(
  task: Task,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const payload = task.payload as unknown as FetchDataPayload;

  signal.throwIfAborted();

  log.info(`[Service] 开始获取数据: ${payload.dataType}`);

  let result: Record<string, unknown> = {};

  switch (payload.dataType) {
    case 'hot_topics':
      result = await fetchHotTopics() as unknown as Record<string, unknown>;
      break;
    case 'content_stats':
      result = await fetchContentStats(payload.accountId, payload.dateRange);
      break;
    case 'account_stats':
      result = await fetchAccountStats(payload.accountId, payload.dateRange);
      break;
    default:
      throw new Error(`未知数据类型: ${payload.dataType}`);
  }

  log.info(`[Service] 数据获取完成: ${payload.dataType}`);
  return result;
}

async function fetchHotTopics(): Promise<FetchResult> {
  // MVP 只支持抖音
  log.info('[Service] 获取抖音热点话题');
  const fetcher = createFetcher('douyin');
  try {
    const result = await fetcher.fetchHotTopics();
    return result;
  } finally {
    await fetcher.close();
  }
}

async function fetchContentStats(
  accountId?: string,
  dateRange?: { start: number; end: number }
): Promise<Record<string, unknown>> {
  log.info(`[Service] 获取内容统计: ${accountId}`);

  const page = await createPage('douyin');

  try {
    await page.goto('https://creator.douyin.com/creator/microapp/home', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await randomDelay(2000, 4000);

    const isLoggedIn = await checkLoginState(page, 'douyin');
    if (!isLoggedIn) {
      throw new Error('抖音账号未登录，请先在浏览器中登录账号');
    }

    const stats = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const viewMatch = pageText.match(/播放[^\d]*(\d+)/);
      const likeMatch = pageText.match(/点赞[^\d]*(\d+)/);
      const commentMatch = pageText.match(/评论[^\d]*(\d+)/);
      const shareMatch = pageText.match(/分享[^\d]*(\d+)/);

      return {
        totalViews: viewMatch ? parseInt(viewMatch[1]) : null,
        totalLikes: likeMatch ? parseInt(likeMatch[1]) : null,
        totalComments: commentMatch ? parseInt(commentMatch[1]) : null,
        totalShares: shareMatch ? parseInt(shareMatch[1]) : null,
      };
    });

    if (stats.totalViews === null && stats.totalLikes === null) {
      throw new Error('无法从页面提取内容统计数据，页面结构可能已变更');
    }

    log.info(`[Service] 内容统计获取完成:`, stats);
    return { accountId, dateRange, ...stats };

  } catch (err) {
    const error = err as Error;
    log.error('[Service] 获取内容统计失败:', error.message);
    throw error;
  } finally {
    await page.close();
  }
}

async function fetchAccountStats(
  accountId?: string,
  dateRange?: { start: number; end: number }
): Promise<Record<string, unknown>> {
  log.info(`[Service] 获取账号统计: ${accountId}`);

  const page = await createPage('douyin');

  try {
    await page.goto('https://creator.douyin.com/creator/microapp/home', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await randomDelay(2000, 4000);

    const isLoggedIn = await checkLoginState(page, 'douyin');
    if (!isLoggedIn) {
      throw new Error('抖音账号未登录，请先在浏览器中登录账号');
    }

    const stats = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const followerMatch = pageText.match(/粉丝[^\d]*(\d+)/);
      const followingMatch = pageText.match(/关注[^\d]*(\d+)/);
      const postsMatch = pageText.match(/(?:作品|视频|笔记)[^\d]*(\d+)/);
      const engagementMatch = pageText.match(/(?:互动|engagement)[^\d]*(\d+(?:\.\d+)?)/);

      return {
        followers: followerMatch ? parseInt(followerMatch[1]) : null,
        following: followingMatch ? parseInt(followingMatch[1]) : null,
        totalPosts: postsMatch ? parseInt(postsMatch[1]) : null,
        engagementRate: engagementMatch ? parseFloat(engagementMatch[1]) : null,
      };
    });

    if (stats.followers === null) {
      throw new Error('无法从页面提取账号统计数据，页面结构可能已变更');
    }

    log.info(`[Service] 账号统计获取完成:`, stats);
    return { accountId, dateRange, ...stats };

  } catch (err) {
    const error = err as Error;
    log.error('[Service] 获取账号统计失败:', error.message);
    throw error;
  } finally {
    await page.close();
  }
}
