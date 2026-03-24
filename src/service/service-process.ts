/**
 * 服务进程 - 在独立进程中执行任务
 * 通过 Child Process 和 Pipe 与主进程通信
 */
import { createPage, closeBrowser, screenshot } from './platform-launcher.js';
import { taskQueue } from './queue.js';
import { rateLimiter } from './rate-limiter.js';
import { selectorManager } from './selector-versioning.js';
import { aiGateway, AIProviderType } from './ai-gateway.js';
import { dailyBriefingAll, checkHotTopics } from './ai-director.js';
import type { Task, Platform, AIRequest } from '../shared/types.js';
import log from 'electron-log';
import { parentPort, workerData } from 'worker_threads';
import { createFetcher, createAllFetchers } from './data-fetcher/index.js';
import type { FetchResult, HotTopic } from './data-fetcher/types.js';

// 服务进程配置
const MAX_CONCURRENT = 3;
const POLL_INTERVAL = 2000; // 2秒轮询

// 当前运行中的任务
const runningTasks = new Map<string, AbortController>();

let isRunning = false;

/**
 * 启动服务循环
 */
export async function startServiceLoop(): Promise<void> {
  if (isRunning) {
    log.warn('服务循环已在运行');
    return;
  }

  isRunning = true;
  log.info(`[Service] 启动服务循环 (最大并发: ${MAX_CONCURRENT})`);

  // 加载 AI Gateway
  aiGateway.loadProviders();

  // 注册每日 08:00 AI 简报（北京时间）
  // 以及热点检测（每4小时）
  function scheduleAI(): void {
    const platforms: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu'];

    // 每日简报检查（每分钟）
    const checkDaily = () => {
      // 北京时间 = UTC时间 + 8小时
      const now = new Date();
      const beijingMs = now.getTime() + 8 * 60 * 60 * 1000;
      const beijingHour = Math.floor((beijingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const beijingMinute = Math.floor((beijingMs % (60 * 60 * 1000)) / (60 * 1000));
      if (beijingHour === 8 && beijingMinute < 5) {
        // 全局视角，所有平台一起分析
        dailyBriefingAll().catch(err => log.error('[Service] 每日简报失败:', err));
      }
    };

    // 热点检测（每4小时）
    let lastHotTopicCheck = 0;
    const HOT_TOPIC_INTERVAL = 4 * 60 * 60 * 1000;  // 4小时
    const runHotTopicCheck = () => {
      const now = Date.now();
      if (now - lastHotTopicCheck >= HOT_TOPIC_INTERVAL) {
        lastHotTopicCheck = now;
        for (const platform of platforms) {
          checkHotTopics(platform).catch(err => log.error('[Service] 热点检测失败:', err));
        }
      }
    };

    setInterval(() => { checkDaily(); runHotTopicCheck(); }, 60000);
    checkDaily();
    runHotTopicCheck();
  }

  scheduleAI();

  while (isRunning) {
    try {
      // 检查是否有空余槽位
      if (runningTasks.size < MAX_CONCURRENT) {
        // 获取下一个待执行任务
        const task = taskQueue.dequeue();

        if (task) {
          // 启动任务执行
          executeTask(task);
        }
      }

      // 轮询间隔
      await sleep(POLL_INTERVAL);
    } catch (error) {
      log.error('[Service] 服务循环错误:', error);
      await sleep(5000); // 出错时延长等待
    }
  }
}

/**
 * 停止服务循环
 */
export function stopServiceLoop(): void {
  isRunning = false;
  log.info('[Service] 停止服务循环');

  // 取消所有运行中的任务
  for (const [taskId, controller] of runningTasks) {
    log.info(`[Service] 取消任务: ${taskId}`);
    controller.abort();
  }
  runningTasks.clear();
}

/**
 * 执行单个任务
 */
async function executeTask(task: Task): Promise<void> {
  log.info(`[Service] 执行任务: ${task.id} [${task.platform}] ${task.title}`);

  const controller = new AbortController();
  runningTasks.set(task.id, controller);

  // 更新状态为运行中
  taskQueue.updateStatus(task.id, 'running');

  try {
    switch (task.type) {
      case 'publish':
        await executePublishTask(task, controller.signal);
        break;
      case 'ai_generate':
        await executeAIGenerateTask(task, controller.signal);
        break;
      case 'fetch_data':
        await executeFetchDataTask(task, controller.signal);
        break;
      case 'automation':
        await executeAutomationTask(task, controller.signal);
        break;
      default:
        throw new Error(`未知任务类型: ${task.type}`);
    }

    // 成功
    taskQueue.updateStatus(task.id, 'completed', {
      result: { finishedAt: Date.now() },
    });
    log.info(`[Service] 任务完成: ${task.id}`);

  } catch (error) {
    const err = error as Error;

    if (err.name === 'AbortError') {
      log.info(`[Service] 任务取消: ${task.id}`);
      taskQueue.updateStatus(task.id, 'cancelled');
      return;
    }

    log.error(`[Service] 任务失败: ${task.id}`, err.message);

    // 标记失败（会自动处理重试）
    taskQueue.markFailed(task.id, err.message);
  } finally {
    runningTasks.delete(task.id);
  }
}

/**
 * 执行发布任务
 */
async function executePublishTask(task: Task, signal: AbortSignal): Promise<void> {
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
    log.warn(`[Service] 限流等待: ${platform}, 需等待 ${limitCheck.waitMs}ms`);
    await sleep(limitCheck.waitMs!);
  }

  signal.throwIfAborted();

  // 获取页面
  const page = await createPage(platform);
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
    rateLimiter.acquire(platform);

    // 清空检查点
    taskQueue.clearCheckpoint(task.id);

    log.info(`[Service] 发布成功: ${task.id}`);

  } finally {
    await page.close();
  }
}

/**
 * 执行 AI 生成任务
 */
async function executeAIGenerateTask(task: Task, signal: AbortSignal): Promise<void> {
  const payload = task.payload as {
    platform?: Platform;
    promptType?: string;
    topic?: string;
    model?: string;
    temperature?: number;
    providerType?: string;
  };

  signal.throwIfAborted();

  // 获取配置的 provider，优先使用任务指定的，否则使用默认 provider
  const defaultProvider = aiGateway.getDefaultProvider();
  const providerType = payload.providerType ?? defaultProvider?.type ?? 'openai';

  const request: AIRequest = {
    providerType: providerType as AIProviderType,
    model: payload.model ?? defaultProvider?.models[0],
    prompt: buildPrompt(payload.promptType ?? 'default', payload.topic ?? ''),
    system: getSystemPrompt(payload.platform),
    temperature: payload.temperature ?? 0.7,
    maxTokens: 2000,
  };

  const response = await aiGateway.generate(request);

  if (!response.success) {
    throw new Error(response.error ?? 'AI 生成失败');
  }

  taskQueue.updateStatus(task.id, 'running', {
    result: { content: response.content },
    progress: 100,
  });
}

/**
 * 执行数据获取任务
 * 支持：热点数据、内容数据、账号数据等
 */
async function executeFetchDataTask(task: Task, signal: AbortSignal): Promise<void> {
  const payload = task.payload as {
    dataType: 'hot_topics' | 'content_stats' | 'account_stats';
    platform?: Platform;
    accountId?: string;
    dateRange?: { start: number; end: number };
  };

  signal.throwIfAborted();

  log.info(`[Service] 开始获取数据: ${payload.dataType}`);

  let result: any = {};

  switch (payload.dataType) {
    case 'hot_topics':
      // 热点数据获取（需要配置热点源）
      result = await fetchHotTopics(payload.platform);
      break;

    case 'content_stats':
      // 内容数据获取
      result = await fetchContentStats(payload.accountId, payload.dateRange);
      break;

    case 'account_stats':
      // 账号数据获取
      result = await fetchAccountStats(payload.accountId, payload.dateRange);
      break;

    default:
      throw new Error(`未知数据类型: ${payload.dataType}`);
  }

  taskQueue.updateStatus(task.id, 'running', {
    result,
    progress: 100,
  });

  log.info(`[Service] 数据获取完成: ${payload.dataType}`);
}

/**
 * 执行自动化任务
 * 支持：自动回复、自动关注、评论管理等
 */
async function executeAutomationTask(task: Task, signal: AbortSignal): Promise<void> {
  const payload = task.payload as {
    action: 'auto_reply' | 'auto_like' | 'auto_follow' | 'comment_management';
    platform?: Platform;
    accountId?: string;
    targetId?: string;
    config?: Record<string, any>;
  };

  signal.throwIfAborted();

  log.info(`[Service] 开始执行自动化任务: ${payload.action}`);

  // 检查登录状态
  const page = await createPage(payload.platform!);
  const isLoggedIn = await checkLoginState(page, payload.platform!);

  if (!isLoggedIn) {
    await page.close();
    throw new Error('账号未登录或 Session 已过期');
  }

  signal.throwIfAborted();

  let result: any = {};

  switch (payload.action) {
    case 'auto_reply':
      result = await executeAutoReply(page, payload);
      break;

    case 'auto_like':
      result = await executeAutoLike(page, payload);
      break;

    case 'auto_follow':
      result = await executeAutoFollow(page, payload);
      break;

    case 'comment_management':
      result = await executeCommentManagement(page, payload);
      break;

    default:
      await page.close();
      throw new Error(`未知自动化操作: ${payload.action}`);
  }

  await page.close();

  taskQueue.updateStatus(task.id, 'running', {
    result,
    progress: 100,
  });

  log.info(`[Service] 自动化任务完成: ${payload.action}`);
}

// ============ 数据获取辅助函数 ============

async function fetchHotTopics(platform?: Platform): Promise<FetchResult> {
  if (platform) {
    // 指定平台
    log.info(`[Service] 获取 ${platform} 热点话题`);
    const fetcher = createFetcher(platform);
    try {
      const result = await fetcher.fetchHotTopics();
      return result;
    } finally {
      await fetcher.close();
    }
  } else {
    // 所有平台
    log.info('[Service] 获取全平台热点话题');
    const fetchers = createAllFetchers();
    const allTopics: HotTopic[] = [];
    const errors: string[] = [];

    for (const fetcher of fetchers) {
      try {
        const result = await fetcher.fetchHotTopics();
        allTopics.push(...result.topics);
        if (result.error) {
          errors.push(`${fetcher.platform}: ${result.error}`);
        }
      } catch (e) {
        errors.push(`${fetcher.platform}: ${(e as Error).message}`);
      } finally {
        await fetcher.close();
      }
    }

    // 按热度排序
    allTopics.sort((a, b) => b.heat - a.heat);

    return {
      topics: allTopics,
      source: 'all',
      fetchedAt: Date.now(),
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }
}

async function fetchContentStats(accountId?: string, dateRange?: { start: number; end: number }): Promise<any> {
  // 内容统计获取
  log.info(`[Service] 获取内容统计: ${accountId}`);

  return {
    accountId,
    dateRange,
    totalViews: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    avgWatchTime: 0,
  };
}

async function fetchAccountStats(accountId?: string, dateRange?: { start: number; end: number }): Promise<any> {
  // 账号统计获取
  log.info(`[Service] 获取账号统计: ${accountId}`);

  return {
    accountId,
    dateRange,
    followers: 0,
    following: 0,
    totalPosts: 0,
    engagementRate: 0,
  };
}

// ============ 自动化辅助函数 ============

// 自动化操作需要的选择器
const AUTO_SELECTORS: Record<string, Record<string, string[]>> = {
  douyin: {
    // 评论列表
    comment_item: ['[data-e2e="comment-item"]', '.comment-item', '[class*="comment"]'],
    comment_input: ['[data-e2e="comment-input"]', 'input[placeholder*="说点什么"]', 'textarea'],
    like_button: ['[data-e2e="like-icon"]', '[class*="like"]', '.heart-icon'],
    follow_button: ['[data-e2e="follow"]', 'button:has-text("关注")', '[class*="follow"]'],
    // 视频相关
    video_item: ['[data-e2e="video-item"]', '.video-item', '[class*="feed"] > div'],
    video_like: ['[data-e2e="like"]', '[class*="like-btn"]', 'button:has-text("赞")'],
  },
  kuaishou: {
    comment_item: ['[class*="comment-item"]', '.comment-item'],
    comment_input: ['textarea[placeholder*="说点什么"]', 'input[class*="comment"]'],
    like_button: ['[class*="like-btn"]', '.heart-icon', 'button:has-text("赞")'],
    follow_button: ['button:has-text("关注")', '[class*="follow"]'],
    video_item: ['[class*="video-item"]', '.feeds-item'],
    video_like: ['[class*="like-icon"]', 'button:has-text("赞")'],
  },
  xiaohongshu: {
    comment_item: ['[class*="comment-item"]', '.comment-item'],
    comment_input: ['textarea[placeholder*="说点什么"]', '[class*="input"] textarea'],
    like_button: ['[class*="like"]', '.heart-icon', 'button:has-text("收藏")]'],
    follow_button: ['button:has-text("关注")', '[class*="follow"]'],
    note_item: ['[class*="note-item"]', '[class*="card"]'],
    note_like: ['[class*="like-icon"]', 'button:has-text("赞")'],
  },
};

// 获取自动化选择器
function getAutoSelectors(platform: Platform, key: string): Array<{ value: string }> {
  const selectors = AUTO_SELECTORS[platform]?.[key] || [];
  return selectors.map(s => ({ value: s }));
}

// 导航到指定页面
async function navigateTo(page: any, platform: Platform, path: string): Promise<void> {
  const baseUrls: Record<Platform, string> = {
    douyin: 'https://www.douyin.com',
    kuaishou: 'https://www.kuaishou.com',
    xiaohongshu: 'https://www.xiaohongshu.com',
  };

  const url = `${baseUrls[platform]}${path}`;
  log.info(`[Service] 导航到: ${url}`);
  await randomDelay(500, 1500);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await randomDelay(2000, 4000);
}

async function executeAutoReply(page: any, payload: any): Promise<any> {
  const { platform, accountId, config } = payload;
  const p = platform as Platform;
  const { keywords = [], replyText = '感谢关注！', maxReplies = 10 } = config || {};

  log.info(`[Service] 执行自动回复: platform=${platform}, max=${maxReplies}`);

  // 导航到评论页面
  const paths: Record<Platform, string> = {
    douyin: '/user/self/posts',
    kuaishou: '/profile',
    xiaohongshu: '/user/profile',
  };

  await navigateTo(page, p, paths[p]);

  let processed = 0;
  let replied = 0;

  // 查找评论项
  const commentSelectors = getAutoSelectors(p, 'comment_item');
  const commentInputSelectors = getAutoSelectors(p, 'comment_input');

  for (let i = 0; i < maxReplies && processed < maxReplies; i++) {
    await randomDelay(1000, 2000);

    // 滚动加载更多评论
    await page.evaluate(() => window.scrollBy(0, 300));
    await randomDelay(500, 1000);

    // 尝试点击评论输入框
    for (const sel of commentInputSelectors) {
      try {
        await page.click(sel.value);
        await randomDelay(300, 600);

        // 输入回复内容
        await page.fill(sel.value, replyText as string);
        await randomDelay(200, 500);

        // 按回车发送
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

async function executeAutoLike(page: any, payload: any): Promise<any> {
  const { platform, accountId, config } = payload;
  const p = platform as Platform;
  const { maxLikes = 20 } = config || {};

  log.info(`[Service] 执行自动点赞: platform=${platform}, max=${maxLikes}`);

  // 导航到首页/推荐页
  const paths: Record<Platform, string> = {
    douyin: '/',
    kuaishou: '/',
    xiaohongshu: '/',
  };

  await navigateTo(page, p, paths[p]);

  let processed = 0;
  let liked = 0;

  // 查找点赞按钮
  const likeSelectors = getAutoSelectors(p, 'video_like') || getAutoSelectors(p, 'like_button');

  for (let i = 0; i < maxLikes; i++) {
    await randomDelay(1500, 3000);

    // 滚动到下一个内容
    await page.evaluate(() => window.scrollBy(0, 400));
    await randomDelay(800, 1500);

    // 尝试点击点赞按钮
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

async function executeAutoFollow(page: any, payload: any): Promise<any> {
  const { platform, accountId, config } = payload;
  const p = platform as Platform;
  const { maxFollows = 10 } = config || {};

  log.info(`[Service] 执行自动关注: platform=${platform}, max=${maxFollows}`);

  // 导航到推荐页
  const paths: Record<Platform, string> = {
    douyin: '/recommend',
    kuaishou: '/discovery',
    xiaohongshu: '/discovery/recommend',
  };

  await navigateTo(page, p, paths[p]);

  let processed = 0;
  let followed = 0;

  const followSelectors = getAutoSelectors(p, 'follow_button');

  for (let i = 0; i < maxFollows; i++) {
    await randomDelay(1500, 3000);

    // 滚动查找关注按钮
    await page.evaluate(() => window.scrollBy(0, 300));
    await randomDelay(500, 1000);

    // 尝试点击关注按钮
    for (const sel of followSelectors) {
      try {
        // 先检查是否已经关注
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

async function executeCommentManagement(page: any, payload: any): Promise<any> {
  const { platform, accountId, config } = payload;
  const p = platform as Platform;
  const { action = 'list', targetId } = config || {};

  log.info(`[Service] 执行评论管理: platform=${platform}, action=${action}`);

  // 导航到评论管理页
  const paths: Record<Platform, string> = {
    douyin: '/user/self/comments',
    kuaishou: '/profile/comments',
    xiaohongshu: '/user/comments',
  };

  await navigateTo(page, p, paths[p]);
  await randomDelay(2000, 4000);

  // 收集评论数据
  const comments: any[] = [];
  const commentSelectors = getAutoSelectors(p, 'comment_item');

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

          comments.push({
            author,
            content,
            time,
            platform,
          });
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

// ============ 辅助函数 ============

// 随机延迟（模拟真人操作，降低被检测风险）
async function randomDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

// 尝试多个选择器（依次尝试直到成功）
async function trySelectors(
  page: any,
  selectors: Array<{ value: string; type?: string }>,
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
      // 选择器失败，尝试下一个
      continue;
    }
  }
  return false;
}

// 获取平台发布页 URL
function getPublishUrl(platform: Platform): string {
  const urls: Record<Platform, string> = {
    douyin: 'https://creator.douyin.com/content/upload',
    kuaishou: 'https://cp.kuaishou.com/interaction/long-video/upload',
    xiaohongshu: 'https://creator.xiaohongshu.com/publish',
  };
  return urls[platform];
}

// 获取平台发布页选择器（带备用）
function getPublishSelectors(platform: Platform, key: string): Array<{ value: string; type?: string }> {
  const selectors: Record<Platform, Record<string, string[]>> = {
    douyin: {
      title_input: ['[data-e2e="title-input"]', '#title', 'input[placeholder*="标题"]', 'textarea'],
      content_input: ['[data-e2e="content-input"]', '.content-editor', 'textarea[placeholder*="正文"]'],
      video_input: ['[data-e2e="upload-input"]', 'input[type="file"]', '.upload-btn input'],
      publish_confirm: ['[data-e2e="publish-btn"]', 'button:has-text("发布")', '.confirm-btn'],
      login_state: ['[data-e2e="user-info"]', '.user-info', '[class*="avatar"]'],
    },
    kuaishou: {
      title_input: ['[data-vv-scope="title"]', 'input[name="title"]', '.title-input'],
      content_input: ['textarea[name="content"]', '.content-editor', 'textarea'],
      video_input: ['input[type="file"]', '.upload-btn input', '[class*="upload"] input'],
      publish_confirm: ['button:has-text("发布")', '.confirm-btn', '[class*="publish"]'],
      login_state: ['[class*="user-info"]', '[class*="avatar"]', '.profile'],
    },
    xiaohongshu: {
      title_input: ['[class*="title"] input', 'input[placeholder*="标题"]', '#title'],
      content_input: ['[class*="editor"] textarea', '[class*="content"] textarea', 'textarea'],
      image_input: ['input[type="file"]', '[class*="upload"] input', '.image-upload input'],
      publish_confirm: ['button:has-text("发布")', '[class*="confirm"]', '.publish-btn'],
      login_state: ['[class*="avatar"]', '[class*="user-info"]', '.user-header'],
    },
  };

  const platformSelectors = selectors[platform]?.[key] || [];
  return platformSelectors.map(s => ({ value: s }));
}

async function navigateToPublish(page: any, platform: Platform): Promise<void> {
  const url = getPublishUrl(platform);
  log.info(`[Service] 导航到发布页: ${url}`);

  // 添加随机等待再导航
  await randomDelay(500, 1500);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 等待页面基本加载
  await randomDelay(2000, 4000);
}

async function checkLoginState(page: any, platform: Platform): Promise<boolean> {
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

async function fillPublishForm(page: any, platform: Platform, payload: Record<string, unknown>): Promise<void> {
  log.info(`[Service] 填写发布表单: ${platform}`);

  // 1. 填写标题
  if (payload.title) {
    const titleSelectors = getPublishSelectors(platform, 'title_input');
    const filled = await trySelectors(page, titleSelectors, 'fill', payload.title as string);
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
    const filled = await trySelectors(page, contentSelectors, 'fill', payload.content as string);
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
        await page.setInputFiles(sel.value, payload.video as string);
        log.info(`[Service] 视频已上传: ${payload.video}`);
        await randomDelay(2000, 4000); // 等待视频上传
        break;
      } catch {
        continue;
      }
    }
  }

  // 4. 上传图片
  if (payload.images && Array.isArray(payload.images)) {
    const imageSelectors = getPublishSelectors(platform, 'image_input') ||
      getPublishSelectors(platform, 'video_input'); // 复用视频选择器

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

  // 5. 填写标签（如果有）
  if (payload.tags && typeof payload.tags === 'string') {
    // 标签输入通常是单独的输入框+回车确认
    const tagSelectors = ['[placeholder*="标签"]', '[placeholder*="话题"]', 'input[class*="tag"]'];
    for (const sel of tagSelectors) {
      try {
        await page.fill(sel, payload.tags as string);
        await page.keyboard.press('Enter');
        log.info(`[Service] 标签已添加: ${payload.tags}`);
        break;
      } catch {
        continue;
      }
    }
  }
}

async function confirmPublish(page: any, platform: Platform): Promise<void> {
  log.info(`[Service] 确认发布: ${platform}`);

  const publishSelectors = getPublishSelectors(platform, 'publish_confirm');

  // 滚动到页面底部（确保按钮可见）
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await randomDelay(500, 1000);

  // 点击发布按钮
  const clicked = await trySelectors(page, publishSelectors, 'click');
  if (clicked) {
    log.info(`[Service] 发布按钮已点击`);
    // 等待发布结果
    await randomDelay(3000, 5000);

    // 检查是否有错误提示
    try {
      const errorSelectors = ['[class*="error"]', '[class*="fail"]', '.toast-error'];
      for (const sel of errorSelectors) {
        const errorEl = await page.$(sel);
        if (errorEl) {
          const errorText = await errorEl.textContent();
          throw new Error(`发布失败: ${errorText}`);
        }
      }
    } catch (error) {
      if ((error as Error).message.includes('发布失败')) {
        throw error;
      }
    }
  } else {
    throw new Error('发布按钮选择器全部失败');
  }
}

function buildPrompt(type: string, topic: string): string {
  const templates: Record<string, string> = {
    default: `主题: ${topic}\n\n请生成相关内容的脚本或文案。`,
    script: `为以下主题生成一个吸引人的短视频脚本:\n${topic}\n\n要求:\n1. 开头有悬念/钩子\n2. 正文有清晰的逻辑结构\n3. 结尾有call-to-action\n4. 总时长控制在60秒以内`,
    promotion: `为以下产品/主题生成种草文案:\n${topic}\n\n要求:\n1. 口语化、亲切\n2. 突出亮点\n3. 引发共鸣`,
  };

  return templates[type] ?? templates.default;
}

function getSystemPrompt(platform?: Platform): string {
  const prompts: Record<string, string> = {
    douyin: '你是一个专业的抖音内容创作者，熟悉短视频节奏和算法偏好。生成的内容要吸引眼球、有节奏感。',
    kuaishou: '你是一个专业的快手内容创作者，熟悉老铁文化和真实感内容。生成的内容要接地气、有温度。',
    xiaohongshu: '你是一个专业的小红书博主，熟悉种草文风和审美标准。生成的内容要有调性、有质感。',
  };

  return prompts[platform ?? 'douyin'];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ 主进程 fork 入口 ============

// 当作为主进程模块导入时
export function createServiceRunner(): {
  start: () => Promise<void>;
  stop: () => void;
} {
  return {
    start: startServiceLoop,
    stop: stopServiceLoop,
  };
}
