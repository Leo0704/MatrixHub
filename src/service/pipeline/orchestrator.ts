import type { PipelineTask, PipelineConfig, InputSource, Platform } from '../../shared/types.js';
import { parseInput } from './input-parser.js';
import { generateContent } from './content-generator.js';
import { taskQueue } from '../queue.js';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { BrowserWindow } from 'electron';

// Pipeline 任务内存存储（生产环境应使用数据库）
const pipelineTaskStore = new Map<string, PipelineTask>();

/**
 * 获取所有 Pipeline 任务
 */
export function getAllPipelineTasks(): PipelineTask[] {
  return Array.from(pipelineTaskStore.values());
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

  const pipelineTask: PipelineTask = {
    id,
    input,
    config,
    platform,
    steps: [
      { step: 'parse', status: 'pending' },
      { step: 'text', status: 'pending' },
      { step: 'voice', status: 'pending' },  // 仅图片集模式需要配音，视频模式跳过
      { step: 'publish', status: 'pending' },
    ],
    currentStep: 'parse',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 存储到内存（生产环境应存储到数据库）
  pipelineTaskStore.set(id, pipelineTask);

  log.info(`[Pipeline] 创建任务: ${id}`);

  // 异步执行
  executePipeline(pipelineTask).catch(err => {
    log.error(`[Pipeline] 执行失败: ${id}`, err);
  });

  return pipelineTask;
}

/**
 * 执行 Pipeline
 */
async function executePipeline(pipelineTask: PipelineTask): Promise<void> {
  log.info(`[Pipeline] 开始执行: ${pipelineTask.id}`);

  try {
    // 更新状态为 running
    pipelineTask.status = 'running';
    pipelineTask.updatedAt = Date.now();
    broadcastPipelineUpdate(pipelineTask);

    // Step 1: 解析输入
    await executeStep(pipelineTask, 'parse', async () => {
      const parseResult = await parseInput(pipelineTask.input);
      if (!parseResult.success) {
        throw new Error(`输入解析失败: ${parseResult.error}`);
      }
      return { product: parseResult.product };
    });

    // 获取解析结果
    const parseResult = (pipelineTask.steps.find(s => s.step === 'parse')?.result as any)?.product;

    // Step 2 & 3: 一次性生成文案和媒体内容（避免重复调用 API）
    await executeStep(pipelineTask, 'text', async () => {
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
    const voiceResult = { voiceBase64: contentResult?.voiceBase64 };

    // Step 4: 生成配音（仅图片集模式且用户选择生成配音）
    if (pipelineTask.config.contentType === 'image' && pipelineTask.config.generateVoice) {
      // voice 已在上一步生成，不需要再次调用
      await executeStep(pipelineTask, 'voice', async () => {
        return { voiceBase64: contentResult?.voiceBase64 };
      });
    } else {
      await skipStep(pipelineTask, 'voice');
    }

    // Step 5: 发布
    if (pipelineTask.config.autoPublish && pipelineTask.config.targetAccounts.length > 0) {
      await executeStep(pipelineTask, 'publish', async () => {
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
              voiceBase64: isImageMode ? voiceResult?.voiceBase64 : undefined,
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
      voiceBase64: voiceResult?.voiceBase64,
      videoUrl: mediaResult?.videoUrl,
      publishedTaskIds: (pipelineTask.steps.find(s => s.step === 'publish')?.result as any)?.publishedTaskIds,
    };

    broadcastPipelineUpdate(pipelineTask);
    log.info(`[Pipeline] 执行完成: ${pipelineTask.id}`);

  } catch (error) {
    log.error(`[Pipeline] 执行失败: ${pipelineTask.id}`, error);
    pipelineTask.status = 'failed';
    pipelineTask.error = (error as Error).message;
    pipelineTask.updatedAt = Date.now();
    broadcastPipelineUpdate(pipelineTask);
  }
}

/**
 * 执行单个步骤
 */
async function executeStep(
  pipelineTask: PipelineTask,
  stepName: string,
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
  } catch (error) {
    step.status = 'failed';
    step.error = (error as Error).message;
    step.completedAt = Date.now();
    throw error;
  }
}

/**
 * 跳过步骤
 */
async function skipStep(pipelineTask: PipelineTask, stepName: string): Promise<void> {
  const step = pipelineTask.steps.find(s => s.step === stepName);
  if (!step) return;

  step.status = 'skipped';
  step.completedAt = Date.now();
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
 * 获取 Pipeline 状态
 */
export async function getPipelineTask(pipelineId: string): Promise<PipelineTask | null> {
  return pipelineTaskStore.get(pipelineId) || null;
}

/**
 * 取消 Pipeline
 */
export async function cancelPipelineTask(pipelineId: string): Promise<void> {
  const task = pipelineTaskStore.get(pipelineId);
  if (task && task.status === 'running') {
    task.status = 'cancelled';
    task.updatedAt = Date.now();
    broadcastPipelineUpdate(task);
  }
}