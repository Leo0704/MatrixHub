/**
 * 服务进程 - 在主进程中执行任务的后台服务循环
 *
 * 注意：此模块运行在主进程中，不是独立进程。
 * 原设计为独立进程，但为简化架构改为在主进程后台运行。
 * 使用异步循环和非阻塞操作确保不阻塞主进程。
 *
 * 架构说明:
 * - service-process.ts: 服务循环和任务调度核心
 * - handlers/: 任务类型处理器 (publish, ai-generate, fetch-data, automation)
 * - config/: 配置 (选择器, prompts)
 * - utils/: 辅助函数 (页面操作)
 */
import { createPage, releasePage } from './platform-launcher.js';
import { taskQueue } from './queue.js';
import { aiGateway } from './ai-gateway.js';
import { dailyBriefingAll, checkHotTopics } from './ai-director.js';
import { sleep } from './utils/sleep.js';
import type { Task, Platform } from '../shared/types.js';
import { getActiveHours } from './config/runtime-config.js';
import log from 'electron-log';
import {
  executePublishTask,
  executeAIGenerateTask,
  executeFetchDataTask,
  executeAutomationTask,
  executePageAgentTask,
} from './handlers/index.js';

// 服务进程配置
const MAX_CONCURRENT = 3;
const MIN_POLL_INTERVAL = 500;  // 最小轮询间隔（毫秒）
const MAX_POLL_INTERVAL = 5000;  // 最大轮询间隔（毫秒）
const TASK_NOTIFY_INTERVAL = 100; // 任务通知检查间隔

// 当前运行中的任务
const runningTasks = new Map<string, AbortController>();

let isRunning = false;
let taskNotifier: (() => void) | null = null;
let lastPollTime = 0;

/**
 * 等待任务（事件驱动，智能间隔）
 */
async function waitForTask(): Promise<Task | null> {
  while (isRunning) {
    const now = Date.now();
    const timeSinceLastPoll = now - lastPollTime;

    // 计算智能轮询间隔
    // 如果刚刚处理过任务，用较短的间隔
    // 如果长时间没任务，逐渐增加间隔
    const queueDepth = getPendingTaskCount();
    let pollInterval: number;

    if (runningTasks.size >= MAX_CONCURRENT) {
      // 全部满载，等待较长间隔
      pollInterval = MAX_POLL_INTERVAL;
    } else if (queueDepth > 5) {
      // 队列积压多，加快轮询
      pollInterval = MIN_POLL_INTERVAL;
    } else if (queueDepth > 0) {
      // 有任务但不多，中等间隔
      pollInterval = MIN_POLL_INTERVAL * 2;
    } else {
      // 队列为空，使用较长间隔 + 抖动
      pollInterval = Math.min(MAX_POLL_INTERVAL, MIN_POLL_INTERVAL * 4 + Math.random() * 1000);
    }

    if (timeSinceLastPoll < pollInterval) {
      // 使用指数退避等待通知或超时
      const waitTime = Math.max(pollInterval - timeSinceLastPoll, TASK_NOTIFY_INTERVAL);
      await sleep(Math.min(waitTime, pollInterval));
      continue;
    }

    lastPollTime = now;
    const task = taskQueue.dequeue();
    if (task) {
      return task;
    }
  }
  return null;
}

/**
 * 通知有新任务（可被调用以立即唤醒轮询）
 */
export function notifyNewTask(): void {
  if (taskNotifier) {
    taskNotifier();
  }
}

/**
 * 获取待处理任务数量（估算）
 */
function getPendingTaskCount(): number {
  const stats = taskQueue.getStats();
  return stats.pending + stats.deferred;
}

/**
 * 启动服务循环
 */
export async function startServiceLoop(): Promise<void> {
  if (isRunning) {
    log.warn('服务循环已在运行');
    return;
  }

  isRunning = true;
  lastPollTime = Date.now();
  log.info(`[Service] 启动服务循环 (最大并发: ${MAX_CONCURRENT})`);

  // 加载 AI Gateway
  aiGateway.loadProviders();

  // 注册每日 08:00 AI 简报（北京时间）
  // 以及热点检测（每4小时）
  function scheduleAI(): void {
    const platforms: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu'];

    // 每日简报检查（每分钟）
    const checkDaily = () => {
      const now = new Date();
      const beijingMs = now.getTime() + 8 * 60 * 60 * 1000;
      const beijingHour = Math.floor((beijingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const beijingMinute = Math.floor((beijingMs % (60 * 60 * 1000)) / (60 * 1000));
      if (beijingHour === 8 && beijingMinute < 5) {
        // 活跃时段感知：只在用户活跃时段内执行简报
        const activeHours = getActiveHours();
        if (beijingHour >= activeHours.start && beijingHour < activeHours.end) {
          dailyBriefingAll().catch(err => log.error('[Service] 每日简报失败:', err));
        } else {
          log.debug(`[Service] 跳过每日简报：不在活跃时段 (${activeHours.start}:00-${activeHours.end}:00)`);
        }
      }
    };

    // 热点检测（每4小时）
    let lastHotTopicCheck = 0;
    const HOT_TOPIC_INTERVAL = 4 * 60 * 60 * 1000;
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
        const task = await waitForTask();
        if (task) {
          executeTask(task);
          // 执行完后立即检查是否还有任务
          continue;
        }
      }

      // 空闲时短暂休眠
      await sleep(TASK_NOTIFY_INTERVAL);
    } catch (error) {
      log.error('[Service] 服务循环错误:', error);
      await sleep(5000);
    }
  }
}

/**
 * 停止服务循环
 */
export function stopServiceLoop(): void {
  isRunning = false;
  log.info('[Service] 停止服务循环');

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

  taskQueue.updateStatus(task.id, 'running');

  try {
    switch (task.type) {
      case 'publish':
        await handlePublishTask(task, controller.signal);
        break;
      case 'ai_generate':
        await handleAIGenerateTask(task, controller.signal);
        break;
      case 'fetch_data':
        await handleFetchDataTask(task, controller.signal);
        break;
      case 'automation':
        await handleAutomationTask(task, controller.signal);
        break;
      case 'page_agent':
        await handlePageAgentTask(task, controller.signal);
        break;
      default:
        throw new Error(`未知任务类型: ${task.type}`);
    }

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
    taskQueue.markFailed(task.id, err);
  } finally {
    runningTasks.delete(task.id);
  }
}

// ============ 任务类型处理器 ============

/**
 * 从 payload 中提取 accountId
 */
function getAccountIdFromTask(task: Task): string | undefined {
  const payload = task.payload as Record<string, unknown>;
  return payload.accountId as string | undefined;
}

async function handlePublishTask(task: Task, signal: AbortSignal): Promise<void> {
  const accountId = getAccountIdFromTask(task);
  const page = await createPage(task.platform, accountId);
  try {
    await executePublishTask(page, task, signal);
  } finally {
    // 发布任务后归还页面到池（保持登录状态）
    await releasePage(page);
  }
}

async function handleAIGenerateTask(task: Task, signal: AbortSignal): Promise<void> {
  await executeAIGenerateTask(task, signal);
}

async function handleFetchDataTask(task: Task, signal: AbortSignal): Promise<void> {
  const result = await executeFetchDataTask(task, signal);
  taskQueue.updateStatus(task.id, 'running', {
    result,
    progress: 100,
  });
}

async function handleAutomationTask(task: Task, signal: AbortSignal): Promise<void> {
  const accountId = getAccountIdFromTask(task);
  const page = await createPage(task.platform as Platform, accountId);
  try {
    const result = await executeAutomationTask(page, task, signal);
    taskQueue.updateStatus(task.id, 'running', {
      result,
      progress: 100,
    });
  } finally {
    // 归还页面到池（保持登录状态）
    await releasePage(page);
  }
}

async function handlePageAgentTask(task: Task, signal: AbortSignal): Promise<void> {
  const accountId = getAccountIdFromTask(task);
  const page = await createPage(task.platform, accountId);
  try {
    const result = await executePageAgentTask(page, task, signal);
    taskQueue.updateStatus(task.id, result.success ? 'completed' : 'failed', {
      result: result as unknown as Record<string, unknown>,
      progress: 100,
    });
  } finally {
    await page.close();
  }
}

// ============ 主进程 fork 入口 ============

export function createServiceRunner(): {
  start: () => Promise<void>;
  stop: () => void;
  notifyNewTask: () => void;
} {
  return {
    start: startServiceLoop,
    stop: stopServiceLoop,
    notifyNewTask,
  };
}
