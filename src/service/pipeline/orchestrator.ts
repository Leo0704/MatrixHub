import type { PipelineTask, PipelineConfig, InputSource, Platform } from '../../shared/types.js';
import { parseInput } from './input-parser.js';
import { generateContent } from './content-generator.js';
import { taskQueue } from '../queue.js';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import { loadAllPipelineTasks, loadPipelineTask, savePipelineTask, updatePipelineStatus } from './store.js';

// Abort controllers for pipeline cancellation
const pipelineAbortControllers = new Map<string, AbortController>();

/**
 * 清理临时文件
 */
function cleanupTempFiles(localFilePaths: string[]): void {
  for (const filePath of localFilePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log.info(`[Pipeline] 已清理临时文件: ${filePath}`);
      }
    } catch (err) {
      log.warn(`[Pipeline] 清理临时文件失败: ${filePath}`, err);
    }
  }
}

/**
 * 获取所有 Pipeline 任务
 */
export function getAllPipelineTasks(): PipelineTask[] {
  return loadAllPipelineTasks();
}

/**
 * 创建并启动一个 Pipeline 任务
 */
export async function createPipelineTask(
  input: InputSource,
  config: PipelineConfig,
  platform: Platform
): Promise<PipelineTask> {
  const id = uuidv4();
  const traceId = uuidv4();  // 贯穿全链路的追踪 ID

  const pipelineTask: PipelineTask = {
    id,
    traceId,
    input,
    config,
    platform,
    steps: [
      { step: 'parse', status: 'pending' },
      { step: 'text', status: 'pending' },
      { step: 'publish', status: 'pending' },
    ],
    currentStep: 'parse',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 存储到数据库
  savePipelineTask(pipelineTask);

  log.info(`[Pipeline] 创建任务: ${id}`);

  // 创建取消控制器
  const abortController = new AbortController();
  pipelineAbortControllers.set(id, abortController);

  // 异步执行
  executePipeline(pipelineTask, abortController.signal).catch(err => {
    log.error(`[Pipeline] 执行失败: ${id}`, err);
  });

  return pipelineTask;
}

/**
 * 执行 Pipeline
 */
async function executePipeline(pipelineTask: PipelineTask, abortSignal?: AbortSignal): Promise<void> {
  const t = pipelineTask.traceId;
  log.info(`[Pipeline][${t}] 开始执行: ${pipelineTask.id}`);
  let tempFiles: string[] = [];

  try {
    // 更新状态为 running
    pipelineTask.status = 'running';
    pipelineTask.updatedAt = Date.now();
    savePipelineTask(pipelineTask);
    broadcastPipelineUpdate(pipelineTask);

    // 检查是否已取消
    if (abortSignal?.aborted) {
      throw new Error('任务已取消');
    }

    // Step 1: 解析输入
    await executeStep(pipelineTask, 'parse', async () => {
      if (abortSignal?.aborted) {
        throw new Error('任务已取消');
      }
      const parseResult = await parseInput(pipelineTask.input);
      if (!parseResult.success) {
        throw new Error(`输入解析失败: ${parseResult.error}`);
      }
      return { product: parseResult.product };
    });

    // 获取解析结果
    const parseResult = (pipelineTask.steps.find(s => s.step === 'parse')?.result as any)?.product;

    // 检查是否已取消
    checkCancelled(pipelineTask.id);

    // Step 2: 一次性生成文案和媒体内容（避免重复调用 API）
    await executeStep(pipelineTask, 'text', async () => {
      checkCancelled(pipelineTask.id);
      const contentResult = await generateContent({
        platform: pipelineTask.platform,
        contentType: pipelineTask.config.contentType,
        imageCount: pipelineTask.config.imageCount,
        generateVoice: pipelineTask.config.generateVoice,
        product: parseResult,
      });
      return {
        text: contentResult.text,
        imageUrls: contentResult.imageUrls,
        videoUrl: contentResult.videoUrl,
        voiceBase64: contentResult.voiceBase64,
        localFilePaths: contentResult.localFilePaths,
      };
    });

    // 获取内容生成结果
    const contentResult = pipelineTask.steps.find(s => s.step === 'text')?.result as any;
    const textResult = { text: contentResult?.text };
    const mediaResult = { imageUrls: contentResult?.imageUrls, videoUrl: contentResult?.videoUrl, localFilePaths: contentResult?.localFilePaths };
    // voice 已包含在 contentResult 中（如果生成了配音的话）

    // 检查是否已取消
    checkCancelled(pipelineTask.id);

    // Step 3: 发布
    if (pipelineTask.config.autoPublish && pipelineTask.config.targetAccounts.length > 0) {
      await executeStep(pipelineTask, 'publish', async () => {
        checkCancelled(pipelineTask.id);
        const publishedTaskIds: string[] = [];
        const isImageMode = pipelineTask.config.contentType === 'image';

        // 使用本地文件路径进行发布（已下载到本地）
        const localFiles = mediaResult?.localFilePaths || [];

        // 检查是否有可用的本地文件
        if (isImageMode && localFiles.length === 0) {
          throw new Error('图片生成失败或下载失败，没有可用的本地图片文件用于发布');
        }
        if (!isImageMode && !mediaResult?.videoUrl && localFiles.length === 0) {
          throw new Error('视频生成失败或下载失败，没有可用的视频文件用于发布');
        }

        for (const accountId of pipelineTask.config.targetAccounts) {
          // 创建发布任务
          const task = await taskQueue.create({
            type: 'publish',
            platform: pipelineTask.platform,
            title: parseResult?.name || 'Pipeline发布',
            payload: {
              title: parseResult?.name || 'Pipeline发布',
              content: textResult?.text || '',
              accountId,
              contentType: isImageMode ? 'image' : 'video',
              // 发布时使用本地文件路径
              images: isImageMode ? localFiles : undefined,
              voiceBase64: isImageMode ? contentResult?.voiceBase64 : undefined,
              video: isImageMode ? undefined : (mediaResult?.videoUrl || localFiles[0]),
            },
          });

          publishedTaskIds.push(task.id);
        }

        return { publishedTaskIds };
      });
    } else {
      await skipStep(pipelineTask, 'publish');
    }

    // Pipeline 完成
    pipelineTask.status = 'completed';
    pipelineTask.updatedAt = Date.now();

    // 汇总结果
    pipelineTask.result = {
      text: textResult?.text,
      imageUrls: mediaResult?.imageUrls,
      voiceBase64: contentResult?.voiceBase64,
      videoUrl: mediaResult?.videoUrl,
      publishedTaskIds: (pipelineTask.steps.find(s => s.step === 'publish')?.result as any)?.publishedTaskIds,
    };

    savePipelineTask(pipelineTask);
    broadcastPipelineUpdate(pipelineTask);
    log.info(`[Pipeline][${t}] 执行完成: ${pipelineTask.id}`);

  } catch (error) {
    const err = error as Error;
    // 如果是用户取消，不记录为失败
    if (err.message === 'Pipeline cancelled by user') {
      log.info(`[Pipeline][${t}] 已取消: ${pipelineTask.id}`);
    } else {
      log.error(`[Pipeline][${t}] 执行失败: ${pipelineTask.id}`, err);
      // 执行 Saga 补偿：逆向执行已完成步骤的补偿逻辑
      await compensate(pipelineTask);
    }
  } finally {
    // 清理临时文件
    const contentResult = pipelineTask.steps.find(s => s.step === 'text')?.result as any;
    const localFilePaths = contentResult?.localFilePaths || [];
    cleanupTempFiles(localFilePaths);
    // 清理 abort controller
    pipelineAbortControllers.delete(pipelineTask.id);
  }
}

/**
 * Saga 补偿：逆向执行已完成步骤的补偿逻辑
 */
async function compensate(pipelineTask: PipelineTask): Promise<void> {
  const t = pipelineTask.traceId;
  log.info(`[Pipeline][${t}] 开始 Saga 补偿: ${pipelineTask.id}`);

  pipelineTask.status = 'compensating';
  pipelineTask.updatedAt = Date.now();
  savePipelineTask(pipelineTask);
  broadcastPipelineUpdate(pipelineTask);

  const compensation: PipelineTask['compensation'] = {};
  const completedSteps = pipelineTask.steps.filter(s => s.status === 'completed');

  for (const step of completedSteps.reverse()) {
    try {
      if (step.step === 'parse') {
        // parse 步骤：清理下载的临时文件
        const result = step.result as { cleanupFiles?: string[] } | undefined;
        if (result?.cleanupFiles?.length) {
          cleanupTempFiles(result.cleanupFiles);
          compensation.parse = { cleanupFiles: result.cleanupFiles };
        }
        log.info(`[Pipeline][${t}] 补偿 parse: 清理 ${result?.cleanupFiles?.length ?? 0} 个文件`);
      }

      if (step.step === 'publish') {
        // publish 步骤：取消已创建的任务
        const result = step.result as { publishedTaskIds?: string[] } | undefined;
        if (result?.publishedTaskIds?.length) {
          for (const taskId of result.publishedTaskIds) {
            try {
              await taskQueue.cancel(taskId);
            } catch (cancelErr) {
              log.warn(`[Pipeline][${t}] 补偿 publish: 取消任务 ${taskId} 失败`, cancelErr);
            }
          }
          compensation.publish = { deletedTaskIds: result.publishedTaskIds };
          log.info(`[Pipeline][${t}] 补偿 publish: 取消 ${result.publishedTaskIds.length} 个发布任务`);
        }
      }
      // text 步骤：生成的媒体文件已在 finally 中通过 cleanupTempFiles 清理
    } catch (compensateErr) {
      log.warn(`[Pipeline][${t}] 补偿步骤 ${step.step} 失败`, compensateErr);
    }
  }

  pipelineTask.status = 'compensated';
  pipelineTask.compensation = compensation;
  pipelineTask.updatedAt = Date.now();
  savePipelineTask(pipelineTask);
  broadcastPipelineUpdate(pipelineTask);
  log.info(`[Pipeline][${t}] Saga 补偿完成: ${pipelineTask.id}`);
}

/**
 * 执行单个步骤
 */
async function executeStep(
  pipelineTask: PipelineTask,
  stepName: "parse" | "text" | "voice" | "publish",
  fn: () => Promise<Record<string, unknown>>
): Promise<void> {
  const step = pipelineTask.steps.find(s => s.step === stepName);
  if (!step) return;

  step.status = 'running';
  step.startedAt = Date.now();
  pipelineTask.currentStep = stepName;
  pipelineTask.updatedAt = Date.now();

  try {
    const result = await fn();
    step.result = result;
    step.status = 'completed';
    step.completedAt = Date.now();
    savePipelineTask(pipelineTask);
  } catch (error) {
    step.status = 'failed';
    step.error = (error as Error).message;
    step.completedAt = Date.now();
    savePipelineTask(pipelineTask);
    throw error;
  }
}

/**
 * 跳过步骤
 */
async function skipStep(pipelineTask: PipelineTask, stepName: "parse" | "text" | "voice" | "publish"): Promise<void> {
  const step = pipelineTask.steps.find(s => s.step === stepName);
  if (!step) return;

  step.status = 'skipped';
  step.completedAt = Date.now();
  savePipelineTask(pipelineTask);
}

/**
 * 向渲染进程广播 Pipeline 更新
 */
function broadcastPipelineUpdate(pipelineTask: PipelineTask): void {
  try {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('pipeline:updated', pipelineTask);
    });
  } catch (error) {
    log.warn('[Pipeline] 广播更新失败:', error);
  }
}

/**
 * 检查 Pipeline 是否已被取消
 * 从数据库重新加载，确保获取最新状态
 */
function checkCancelled(taskId: string): void {
  const current = loadPipelineTask(taskId);
  if (current?.status === 'cancelled') {
    throw new Error('Pipeline cancelled by user');
  }
}

/**
 * 获取 Pipeline 状态
 */
export async function getPipelineTask(pipelineId: string): Promise<PipelineTask | null> {
  return loadPipelineTask(pipelineId);
}

/**
 * 取消 Pipeline
 */
export async function cancelPipelineTask(pipelineId: string): Promise<void> {
  const task = loadPipelineTask(pipelineId);
  if (task && task.status === 'running') {
    // 信号取消
    const abortController = pipelineAbortControllers.get(pipelineId);
    if (abortController) {
      abortController.abort();
    }
    updatePipelineStatus(pipelineId, 'cancelled');
    broadcastPipelineUpdate(task);
    // 清理
    pipelineAbortControllers.delete(pipelineId);
  }
}