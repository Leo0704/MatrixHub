import type { Page } from 'playwright';
import type { AccountMetrics } from '../../shared/types.js';
import log from 'electron-log';

export async function scrapeAccountMetrics(
  page: Page,
  accountId: string,
  accountName: string
): Promise<AccountMetrics> {
  try {
    // 打开创作者中心 - 抖音创作者中心 URL
    await page.goto('https://creator.douyin.com/creator-micro/home', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 等待页面加载
    await page.waitForTimeout(2000);

    // 提取数据
    const metrics = await extractMetrics(page);

    // 检查账号状态（是否被限流或封禁）
    const healthStatus = await detectHealthStatus(page);

    return {
      accountId,
      accountName,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      favorites: metrics.favorites,
      shares: metrics.shares,
      followerDelta: metrics.followerDelta,
      healthStatus,
    };
  } catch (error) {
    log.error(`[DouyinMetrics] Failed to scrape account ${accountId}:`, error);
    // 返回默认值，表示获取失败
    return {
      accountId,
      accountName,
      views: 0,
      likes: 0,
      comments: 0,
      favorites: 0,
      shares: 0,
      followerDelta: 0,
      healthStatus: 'limited', // 默认标记为受限，下次重试
    };
  }
}

async function extractMetrics(page: Page): Promise<{
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  followerDelta: number;
}> {
  try {
    // 尝试从页面提取播放量（这个选择器需要根据实际页面调整）
    const viewsText = await page.$eval(
      '.creator-home-count .count-text, [data-e2e="video-play-count"]',
      el => el.textContent || '0'
    ).catch(() => '0');

    const likesText = await page.$eval(
      '.like-count, [data-e2e="like-count"]',
      el => el.textContent || '0'
    ).catch(() => '0');

    const commentsText = await page.$eval(
      '.comment-count, [data-e2e="comment-count"]',
      el => el.textContent || '0'
    ).catch(() => '0');

    const favoritesText = await page.$eval(
      '.favorite-count, [data-e2e="favorite-count"]',
      el => el.textContent || '0'
    ).catch(() => '0');

    const sharesText = await page.$eval(
      '.share-count, [data-e2e="share-count"]',
      el => el.textContent || '0'
    ).catch(() => '0');

    const followerDeltaText = await page.$eval(
      '.follower-delta, .new-follower-count',
      el => el.textContent || '0'
    ).catch(() => '0');

    return {
      views: parseCount(viewsText),
      likes: parseCount(likesText),
      comments: parseCount(commentsText),
      favorites: parseCount(favoritesText),
      shares: parseCount(sharesText),
      followerDelta: parseCount(followerDeltaText),
    };
  } catch {
    return { views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, followerDelta: 0 };
  }
}

async function detectHealthStatus(page: Page): Promise<'normal' | 'limited' | 'banned'> {
  try {
    // 检测封禁提示
    const bannedElement = await page.$('text=/账号已被封禁|账号被封禁|违规封禁/');
    if (bannedElement) return 'banned';

    // 检测限流提示
    const limitedElement = await page.$('text=/流量受限|推荐受限|账号异常/');
    if (limitedElement) return 'limited';

    return 'normal';
  } catch {
    return 'normal';
  }
}

export function parseCount(text: string): number {
  // 处理 "1.2万", "3.5亿" 等格式
  const cleaned = text.replace(/[,，\s]/g, '').trim();

  if (/万$/.test(cleaned)) {
    return Math.round(parseFloat(cleaned) * 10000);
  }
  if (/亿$/.test(cleaned)) {
    return Math.round(parseFloat(cleaned) * 100000000);
  }
  if (/^\d+\.?\d*$/.test(cleaned)) {
    return parseInt(cleaned, 10);
  }
  return 0;
}

export async function scrapeCampaignMetrics(
  accountInfos: Array<{ accountId: string; accountName: string; page: Page }>
): Promise<AccountMetrics[]> {
  // 并发爬取所有账号（限制并发数为3）
  const results: AccountMetrics[] = [];
  const chunkSize = 3;

  for (let i = 0; i < accountInfos.length; i += chunkSize) {
    const chunk = accountInfos.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(info => scrapeAccountMetrics(info.page, info.accountId, info.accountName))
    );
    results.push(...chunkResults);
  }

  return results;
}