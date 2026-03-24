/**
 * 服务进程 - 在独立进程中执行任务
 * 通过 Child Process 和 Pipe 与主进程通信
 *
 * 架构说明:
 * - service-process.ts: 服务循环和任务调度核心
 * - handlers/: 任务类型处理器 (publish, ai-generate, fetch-data, automation)
 * - config/: 配置 (选择器, prompts)
 * - utils/: 辅助函数 (页面操作)
 */
import { createPage } from './platform-launcher.js';
import { taskQueue } from './queue.js';
import { aiGateway } from './ai-gateway.js';
import { dailyBriefingAll, checkHotTopics } from './ai-director.js';
import type { Task, Platform } from '../shared/types.js';
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
      const now = new Date();
      const beijingMs = now.getTime() + 8 * 60 * 60 * 1000;
      const beijingHour = Math.floor((beijingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const beijingMinute = Math.floor((beijingMs % (60 * 60 * 1000)) / (60 * 1000));
      if (beijingHour === 8 && beijingMinute < 5) {
        dailyBriefingAll().catch(err => log.error('[Service] 每日简报失败:', err));
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
        const task = taskQueue.dequeue();
        if (task) {
          executeTask(task);
        }
      }

      await sleep(POLL_INTERVAL);
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
    taskQueue.markFailed(task.id, err.message);
  } finally {
    runningTasks.delete(task.id);
  }
}

// ============ 任务类型处理器 ============

async function handlePublishTask(task: Task, signal: AbortSignal): Promise<void> {
  const page = await createPage(task.platform);
  try {
    await executePublishTask(page, task, signal);
  } finally {
    // executePublishTask 已经关闭了 page，但为了安全再检查一下
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
  const page = await createPage(task.platform as Platform);
  try {
    const result = await executeAutomationTask(page, task, signal);
    taskQueue.updateStatus(task.id, 'running', {
      result,
      progress: 100,
    });
  } finally {
    await page.close();
  }
}

async function handlePageAgentTask(task: Task, signal: AbortSignal): Promise<void> {
  const page = await createPage(task.platform);
  try {
    const result = await executePageAgentTask(page, task, signal);
    taskQueue.updateStatus(task.id, result.success ? 'completed' : 'failed', {
      result,
      progress: 100,
    });
  } finally {
    await page.close();
  }
}

// ============ 辅助函数 ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ 主进程 fork 入口 ============

export function createServiceRunner(): {
  start: () => Promise<void>;
  stop: () => void;
} {
  return {
    start: startServiceLoop,
    stop: stopServiceLoop,
  };
}
