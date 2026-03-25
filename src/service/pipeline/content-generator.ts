import type { Platform, PipelineConfig } from '../../shared/types.js';
import type { ParsedProduct } from './types.js';
import { aiGateway } from '../ai-gateway.js';
import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GenerationResult {
  text?: string;
  imageUrls?: string[];      // 图片集模式返回多张图片 URL
  voiceBase64?: string;     // 可选配音（语音版本附件）
  videoUrl?: string;        // 视频模式返回视频 URL
  localFilePaths?: string[]; // 下载到本地的文件路径
}

export interface GenerationContext {
  platform: Platform;
  contentType: 'image' | 'video';
  imageCount?: 3 | 6 | 9;   // 仅图片集模式，默认 9
  generateVoice?: boolean;  // 仅图片集模式，配音作为语音版本附件
  product: ParsedProduct;
}

/**
 * 内容生成协调器 - 根据内容类型生成
 * - 图片集模式：文案 → 图片（多张）→ 可选配音
 * - 视频模式：文案 → 视频（视频自带音频，轮询等待）
 */
export async function generateContent(ctx: GenerationContext): Promise<GenerationResult> {
  const result: GenerationResult = {};
  const { platform, contentType, imageCount, generateVoice, product } = ctx;

  log.info('[ContentGenerator] 开始生成内容:', { platform, contentType, imageCount, generateVoice });

  // 1. 生成文案（两种模式都需要）
  log.info('[ContentGenerator] 生成文案...');
  result.text = await generateText(platform, product);

  if (contentType === 'image') {
    // 图片集模式：文案 → 图片（多张）
    log.info(`[ContentGenerator] 生成${imageCount || 9}张图片...`);
    result.imageUrls = await generateImages(platform, product, result.text, imageCount || 9);

    // 可选配音（作为语音版本附件）
    if (generateVoice) {
      log.info('[ContentGenerator] 生成配音（语音版本附件）...');
      result.voiceBase64 = await generateVoice(platform, product, result.text);
    }
  } else {
    // 视频模式：文案 → 视频（视频自带音频，轮询等待）
    log.info('[ContentGenerator] 生成视频（等待完成）...');
    result.videoUrl = await generateVideoWithWait(platform, product, result.text);
  }

  // 下载媒体文件到本地（用于发布）
  log.info('[ContentGenerator] 下载媒体文件到本地...');
  result.localFilePaths = await downloadMediaFiles(result);

  log.info('[ContentGenerator] 内容生成完成');
  return result;
}

/**
 * 生成多张图片
 */
async function generateImages(platform: Platform, product: ParsedProduct, text: string, count: number): Promise<string[]> {
  const imageContext = getPlatformImageContext(platform);
  const urls: string[] = [];

  for (let i = 0; i < count; i++) {
    const prompt = `${imageContext}\n\n产品名称: ${product.name}\n营销文案: ${text}\n第${i + 1}张图`;

    const response = await aiGateway.generate({
      taskType: 'image',
      prompt,
      system: `你是一个专业的视觉创作专家，擅长生成符合平台风格的图片。`,
    });

    if (!response.success) {
      throw new Error(`第${i + 1}张图片生成失败: ${response.error}`);
    }

    try {
      const data = JSON.parse(response.content!);
      urls.push(data.url);
    } catch {
      throw new Error(`第${i + 1}张图片URL解析失败`);
    }
  }

  return urls;
}

/**
 * 生成视频（轮询等待完成）
 */
async function generateVideoWithWait(platform: Platform, product: ParsedProduct, text: string): Promise<string> {
  const videoContext = getPlatformVideoContext(platform);

  const prompt = `${videoContext}\n\n产品名称: ${product.name}\n营销文案: ${text}`;

  const response = await aiGateway.generate({
    taskType: 'video',
    prompt,
    system: `你是一个专业的视频创作专家，擅长生成短视频内容。`,
  });

  if (!response.success) {
    throw new Error(`视频生成失败: ${response.error}`);
  }

  // 解析返回的 task_id
  let taskId: string | null = null;
  try {
    const data = JSON.parse(response.content!);
    taskId = data.taskId || null;
    if (!taskId && data.url) {
      // 如果直接返回了 URL，直接使用
      return data.url;
    }
  } catch {
    // 如果不是 JSON 格式，可能是直接返回的 URL
    return response.content!;
  }

  if (!taskId) {
    throw new Error('视频生成响应中未找到 task_id');
  }

  // 轮询等待视频生成完成（最多 5 分钟）
  log.info(`[ContentGenerator] 视频生成任务: ${taskId}，开始轮询...`);
  const maxWaitTime = 5 * 60 * 1000; // 5 分钟
  const pollInterval = 10000; // 10 秒
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const videoUrl = await checkVideoStatus(taskId);
    if (videoUrl) {
      log.info(`[ContentGenerator] 视频生成完成: ${videoUrl}`);
      return videoUrl;
    }
  }

  throw new Error('视频生成超时（5分钟），请重试');
}

/**
 * 检查视频生成状态
 */
async function checkVideoStatus(taskId: string): Promise<string | null> {
  // TODO: 根据不同视频 provider 实现状态查询
  // Doubao: GET /v1/video/generate/{task_id}
  // MiniMax: GET /v1/video/generate/{task_id}
  // 返回 video_url 表示完成，否则返回 null 表示还在处理中
  return null;
}

/**
 * 下载媒体文件到本地临时目录
 */
async function downloadMediaFiles(result: GenerationResult): Promise<string[]> {
  const localPaths: string[] = [];
  const tmpDir = os.tmpdir();

  // 下载图片
  if (result.imageUrls) {
    for (const url of result.imageUrls) {
      try {
        const localPath = await downloadFile(url, path.join(tmpDir, `img-${Date.now()}.png`));
        localPaths.push(localPath);
      } catch (err) {
        log.warn(`[ContentGenerator] 图片下载失败: ${url}`, err);
      }
    }
  }

  // 下载视频
  if (result.videoUrl && !result.videoUrl.startsWith('data:')) {
    try {
      const localPath = await downloadFile(result.videoUrl, path.join(tmpDir, `video-${Date.now()}.mp4`));
      localPaths.push(localPath);
    } catch (err) {
      log.warn(`[ContentGenerator] 视频下载失败: ${result.videoUrl}`, err);
    }
  }

  return localPaths;
}

/**
 * 下载文件到本地
 */
async function downloadFile(url: string, destPath: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
  return destPath;
}

/**
 * 生成营销文案
 */
async function generateText(platform: Platform, product: ParsedProduct): Promise<string> {
  const platformContext = getPlatformTextContext(platform);

  const prompt = `${platformContext}

产品名称: ${product.name}
产品描述: ${product.description}
${product.features ? `产品特点: ${product.features.join(', ')}` : ''}

请生成一段吸引人的营销文案，突出产品卖点，适合在${platform}平台发布。`;

  const response = await aiGateway.generate({
    taskType: 'text',
    prompt,
    system: `你是一个专业的社交媒体营销文案专家，擅长生成符合平台调性的吸引人内容。`,
    temperature: 0.8,
    maxTokens: 2000,
  });

  if (!response.success) {
    throw new Error(`文案生成失败: ${response.error}`);
  }

  return response.content!;
}

/**
 * 生成产品图片
 */
async function generateImage(platform: Platform, product: ParsedProduct, text: string): Promise<string> {
  const imageContext = getPlatformImageContext(platform);

  const prompt = `${imageContext}

产品名称: ${product.name}
营销文案: ${text}

请生成一张高质量的产品宣传图，色彩鲜明、视觉冲击力强，能在0.5秒内抓住用户眼球。`;

  const response = await aiGateway.generate({
    taskType: 'image',
    prompt,
    system: `你是一个专业的视觉创作专家，擅长生成符合平台风格的图片。`,
  });

  if (!response.success) {
    throw new Error(`图片生成失败: ${response.error}`);
  }

  // 解析返回的图片 URL
  try {
    const data = JSON.parse(response.content!);
    return data.url;
  } catch {
    throw new Error(`图片URL解析失败`);
  }
}

/**
 * 生成配音
 */
async function generateVoice(platform: Platform, product: ParsedProduct, text: string): Promise<string> {
  const voiceContext = getPlatformVoiceContext(platform);

  // 配音文本要简洁
  const voiceText = text.slice(0, 500);

  const response = await aiGateway.generate({
    taskType: 'voice',
    prompt: voiceText,
    system: voiceContext,
  });

  if (!response.success) {
    throw new Error(`配音生成失败: ${response.error}`);
  }

  return response.content!;  // base64 编码的音频
}

/**
 * 生成视频
 */
async function generateVideo(platform: Platform, product: ParsedProduct, text: string, imageUrl?: string): Promise<string> {
  const videoContext = getPlatformVideoContext(platform);

  const prompt = `${videoContext}

产品名称: ${product.name}
营销文案: ${text}
${imageUrl ? `参考图片: ${imageUrl}` : ''}

请生成视频创作描述，包括：
1. 视频类型和风格
2. 主要场景和镜头
3. 节奏和转场建议
4. 配乐风格建议

然后调用视频生成 API 生成视频。`;

  const response = await aiGateway.generate({
    taskType: 'video',
    prompt,
    system: `你是一个专业的视频创作专家，擅长生成短视频内容。`,
  });

  if (!response.success) {
    throw new Error(`视频生成失败: ${response.error}`);
  }

  // 解析返回的视频 URL 或 task_id
  try {
    const data = JSON.parse(response.content!);
    return data.url || data.taskId || response.content!;
  } catch {
    return response.content!;
  }
}

// ============ 平台上下文辅助函数 ============

function getPlatformTextContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '抖音是一个短视频平台，内容要：1）前3秒必须有强钩子 2）节奏快，信息密集 3）结尾留悬念或强CTA 4）语言年轻化、有活力。',
    kuaishou: '快手用户喜欢：真实感、有故事性、接地气的内容。语言要亲切自然，像是朋友在聊天。',
    xiaohongshu: '小红书用户喜欢：有干货价值、有审美价值的内容。语言要有质感，像是闺蜜在分享心得。',
  };
  return contexts[platform];
}

function getPlatformImageContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '抖音用户喜欢：色彩鲜艳、视觉冲击力强、有趣好玩的画面。封面图要能在0.5秒内抓住用户眼球。',
    kuaishou: '快手用户喜欢：真实感、接地气、有故事性的画面。避免过度精致，追求自然和亲和力。',
    xiaohongshu: '小红书用户喜欢：高颜值、精致感、有审美价值的画面。色调要高级感，排版要美观。',
  };
  return contexts[platform];
}

function getPlatformVoiceContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '配音风格要求：年轻化、有活力、节奏感强。适合快节奏的短视频，内容要简洁有力。',
    kuaishou: '配音风格要求：亲切自然、接地气。像是朋友在和你聊天，不要太正式。',
    xiaohongshu: '配音风格要求：有质感、温柔亲切。像是闺蜜在分享心得，有代入感。',
  };
  return contexts[platform];
}

function getPlatformVideoContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '抖音视频要求：1）前3秒必须有强钩子 2）节奏快，信息密集 3）结尾留悬念或强CTA 4）适合竖屏9:16格式。',
    kuaishou: '快手视频要求：真实感、有故事性、接地气。可以有更多时间展开，适合有温度的叙事。',
    xiaohongshu: '小红书视频要求：1）高颜值、精致感 2）内容有干货价值 3）适合生活方式类内容 4）竖屏或方形皆可。',
  };
  return contexts[platform];
}
