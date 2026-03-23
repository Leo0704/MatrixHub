/**
 * 服务进程 - 在独立进程中执行任务
 * 通过 Child Process 和 Pipe 与主进程通信
 */
import { createPage, closeBrowser, screenshot } from './platform-launcher.js';
import { taskQueue } from './queue.js';
import { rateLimiter } from './rate-limiter.js';
import { selectorManager } from './selector-versioning.js';
import { aiGateway } from './ai-gateway.js';
import type { Task, Platform, AIRequest } from '../shared/types.js';
import log from 'electron-log';
import { parentPort, workerData } from 'worker_threads';

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
  };

  signal.throwIfAborted();

  const request: AIRequest = {
    providerType: 'openai', // TODO: 从配置获取
    model: payload.model,
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
 */
async function executeFetchDataTask(task: Task, signal: AbortSignal): Promise<void> {
  // TODO: 实现数据获取逻辑
  throw new Error('数据获取任务未实现');
}

/**
 * 执行自动化任务
 */
async function executeAutomationTask(task: Task, signal: AbortSignal): Promise<void> {
  // TODO: 实现通用自动化逻辑
  throw new Error('自动化任务未实现');
}

// ============ 辅助函数 ============

async function navigateToPublish(page: any, platform: Platform): Promise<void> {
  const urls: Record<Platform, string> = {
    douyin: 'https://creator.douyin.com/content/upload',
    kuaishou: 'https://cp.kuaishou.com/interaction/long-video/upload',
    xiaohongshu: 'https://creator.xiaohongshu.com/publish',
  };

  await page.goto(urls[platform], { waitUntil: 'networkidle', timeout: 60000 });
}

async function checkLoginState(page: any, platform: Platform): Promise<boolean> {
  const selector = selectorManager.get(platform, 'login_state');

  if (!selector) {
    return false;
  }

  try {
    await page.waitForSelector(selector.value, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function fillPublishForm(page: any, platform: Platform, payload: Record<string, unknown>): Promise<void> {
  // 填写标题
  const titleSelector = selectorManager.get(platform, 'title_input');
  if (titleSelector && payload.title) {
    await page.fill(titleSelector.value, payload.title as string);
    selectorManager.reportSuccess(platform, 'title_input');
  }

  // 填写内容
  const contentSelector = selectorManager.get(platform, 'content_input');
  if (contentSelector && payload.content) {
    await page.fill(contentSelector.value, payload.content as string);
    selectorManager.reportSuccess(platform, 'content_input');
  }
}

async function confirmPublish(page: any, platform: Platform): Promise<void> {
  const publishSelector = selectorManager.get(platform, 'publish_confirm');
  if (publishSelector) {
    await page.click(publishSelector.value);
    await page.waitForTimeout(3000);
    selectorManager.reportSuccess(platform, 'publish_confirm');
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
