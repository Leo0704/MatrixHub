import type { PipelineTask, PipelineConfig, InputSource, Platform } from '../../shared/types.js';
import { parseInput } from './input-parser.js';
import { generateContent } from './content-generator.js';
import { executePublishTask } from '../handlers/publish-handler.js';
import { taskQueue } from '../queue.js';
import { accountManager } from '../credential-manager.js';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';

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
      { step: 'media', status: 'pending' },
      { step: 'voice', status: 'pending' },  // 仅图片集模式需要配音，视频模式跳过
      { step: 'publish', status: 'pending' },
    ],
    currentStep: 'parse',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 保存到数据库（通过 taskQueue 的扩展字段或单独存储）
  // TODO: 实现 pipeline_task 的数据库存储

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

    // Step 2: 生成文案（始终执行）
    await executeStep(pipelineTask, 'text', async () => {
      const contentResult = await generateContent({
        platform: pipelineTask.platform,
        contentType: pipelineTask.config.contentType,
        product: parseResult,
      });
      return { text: contentResult.text };
    });

    // 获取文案结果
    const textResult = pipelineTask.steps.find(s => s.step === 'text')?.result as any;

    // Step 3: 生成内容（图片集 或 视频）
    await executeStep(pipelineTask, 'media', async () => {
      const contentResult = await generateContent({
        platform: pipelineTask.platform,
        contentType: pipelineTask.config.contentType,
        product: parseResult,
      });
      return {
        imageUrls: contentResult.imageUrls,  // 注意：是 imageUrls（复数），不是 imageUrl
        videoUrl: contentResult.videoUrl,
      };
    });

    // 获取内容结果
    const mediaResult = pipelineTask.steps.find(s => s.step === 'media')?.result as any;

    // Step 4: 生成配音（仅图片集模式需要，视频模式跳过）
    if (pipelineTask.config.contentType === 'image') {
      await executeStep(pipelineTask, 'voice', async () => {
        const contentResult = await generateContent({
          platform: pipelineTask.platform,
          contentType: 'image',
          product: parseResult,
        });
        return { voiceBase64: contentResult.voiceBase64 };
      });
    } else {
      await skipStep(pipelineTask, 'voice');
    }

    // 获取配音结果
    const voiceResult = pipelineTask.steps.find(s => s.step === 'voice')?.result as any;

    // Step 5: 发布
    if (pipelineTask.config.autoPublish && pipelineTask.config.targetAccounts.length > 0) {
      await executeStep(pipelineTask, 'publish', async () => {
        const publishedTaskIds: string[] = [];
        const isImageMode = pipelineTask.config.contentType === 'image';

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
              imageUrls: isImageMode ? mediaResult?.imageUrls : undefined,
              voiceBase64: isImageMode ? voiceResult?.voiceBase64 : undefined,
              videoUrl: isImageMode ? undefined : mediaResult?.videoUrl,
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

    log.info(`[Pipeline] 执行完成: ${pipelineTask.id}`);

  } catch (error) {
    log.error(`[Pipeline] 执行失败: ${pipelineTask.id}`, error);
    pipelineTask.status = 'failed';
    pipelineTask.error = (error as Error).message;
    pipelineTask.updatedAt = Date.now();
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
 * 获取 Pipeline 状态
 */
export async function getPipelineTask(pipelineId: string): Promise<PipelineTask | null> {
  // TODO: 从数据库查询
  return null;
}

/**
 * 取消 Pipeline
 */
export async function cancelPipelineTask(pipelineId: string): Promise<void> {
  // TODO: 实现取消逻辑
}