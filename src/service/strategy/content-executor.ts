/**
 * 内容执行器 - 根据内容策略生成最终内容
 * 负责调用 AI 生成文案、图片等实际素材
 */
import { aiGateway } from '../ai-gateway.js';
import type { ProductInfo } from '../../shared/types.js';
import type { AccountContentPlan } from '../ai-director.js';
import log from 'electron-log';

export interface GeneratedContent {
  text: string;           // 最终文案
  images: string[];       // 图片 URL 列表
  video?: string;          // 视频 URL（如果有）
  voiceBase64?: string;   // 配音（如果有）
  hashtags: string[];       // 最终使用的 Hashtag
}

export interface GenerateContentParams {
  plan: AccountContentPlan;        // 内容策略
  productInfo: ProductInfo;         // 产品信息
  contentType: 'video' | 'image_text';
  addVoiceover: boolean;
  marketingGoal: 'exposure' | 'engagement' | 'conversion';
  campaignId?: string;             // 设计文档第22节：内容新鲜度追踪
  iteration?: number;              // 当前迭代轮次
  accountTags?: string[];          // 设计文档第20节：账号标签
}

/**
 * 根据内容策略生成最终内容
 * 设计文档第22节：内容新鲜度 - 每次迭代生成的内容必须不同于历史版本
 */
export async function generateContent(params: GenerateContentParams): Promise<GeneratedContent> {
  const { plan, productInfo, contentType, addVoiceover, marketingGoal, campaignId, iteration, accountTags } = params;

  log.info('[ContentExecutor] 生成内容:', plan.accountId, contentType);

  // Step 1: 生成文案
  let text = await generateText(plan, productInfo, marketingGoal);

  // Step 1.5: 内容新鲜度检查（设计文档第22节）
  if (campaignId && iteration !== undefined) {
    const { checkContentFreshness, regenerateWithFreshness, recordContent } = await import('../moderation/content-freshness.js');
    const freshness = await checkContentFreshness(campaignId, text, []);

    if (!freshness.isFresh) {
      log.info('[ContentExecutor] 内容与历史版本相似，尝试重新生成:', freshness.reasons);
      const regenerated = await regenerateWithFreshness(text, [], freshness.suggestions);
      if (regenerated.text) {
        text = regenerated.text;
        log.info('[ContentExecutor] 重新生成完成');
      }
    }

    // 记录本次内容到历史
    recordContent(campaignId, plan.accountId, iteration, text, []);
  }

  // Step 2: 审核文案（违规词检测+修改）
  const { moderateAndFix } = await import('../moderation/content-moderator.js');
  const moderationResult = await moderateAndFix(text);
  let safeText = moderationResult.revisedContent || text;

  // Step 2.5: 对 AI 重写后的内容进行二次审核，确保通过后再继续
  let finalCheck = moderationResult;
  let retryCount = 0;
  const maxRetries = 2;
  while (!finalCheck.passed && retryCount < maxRetries) {
    log.info(`[ContentExecutor] 内容审核未通过，第 ${retryCount + 1} 次重写:`, finalCheck.violations.map(v => v.matched));
    const revised = await moderateAndFix(safeText);
    if (revised.passed) {
      safeText = revised.revisedContent || safeText;
      finalCheck = { passed: true, violations: [] };
    } else {
      safeText = revised.revisedContent || safeText;
      finalCheck = revised;
      retryCount++;
    }
  }

  if (!finalCheck.passed) {
    log.warn('[ContentExecutor] 内容违规无法完全消除，标记发布风险:', finalCheck.violations.map(v => v.matched));
  }

  // Step 3: 生成图片或视频
  let images: string[] = [];
  let video: string | undefined;

  if (contentType === 'image_text') {
    // 生成图片
    images = await generateImages(plan, productInfo);
  } else {
    // 生成视频
    video = await generateVideo(plan, productInfo);
  }

  // Step 4: 生成配音（如果需要）
  let voiceBase64: string | undefined;
  if (addVoiceover) {
    voiceBase64 = await generateVoiceover(safeText);
  }

  // Step 5: 生成/优化 Hashtag
  let hashtags = await generateHashtags(plan, productInfo, safeText, accountTags);

  // Step 5.5: 审核 Hashtag，移除含违规词的标签
  const { moderateText: moderateHashtagText } = await import('../moderation/content-moderator.js');
  const hashtagText = hashtags.join(' ');
  const hashtagCheck = moderateHashtagText(hashtagText);
  if (!hashtagCheck.passed) {
    const safeHashtagSet = hashtags.filter(tag => {
      for (const v of hashtagCheck.violations) {
        if (tag.includes(v.matched)) return false;
      }
      return true;
    });
    log.info('[ContentExecutor] Hashtag 审核清理:', { before: hashtags.length, after: safeHashtagSet.length, removed: hashtagCheck.violations.map(v => v.matched) });
    hashtags = safeHashtagSet;
  }

  log.info('[ContentExecutor] 内容生成完成:', plan.accountId, { textLength: safeText.length, images: images.length, video: !!video });

  return {
    text: safeText,
    images,
    video,
    voiceBase64,
    hashtags,
  };
}

async function generateText(
  plan: AccountContentPlan,
  productInfo: ProductInfo,
  marketingGoal: 'exposure' | 'engagement' | 'conversion'
): Promise<string> {
  const goalLabels = {
    exposure: '最大化曝光和播放量',
    engagement: '最大化点赞、评论、收藏、转发',
    conversion: '最大化转化和成交',
  };

  const prompt = `你是一个抖音内容创作者，为以下产品创作一条推广文案。

产品信息：
- 名称：${productInfo.name}
- 描述：${productInfo.description}
${productInfo.brand ? `- 品牌：${productInfo.brand}` : ''}
${productInfo.targetAudience ? `- 目标人群：${productInfo.targetAudience}` : ''}

内容策略：
- 内容角度：${plan.contentAngle}
- 目标人群：${plan.targetAudience}

营销目标：${goalLabels[marketingGoal]}

要求：
1. 文案要有吸引力，能引发用户兴趣
2. 符合抖音平台风格，可以带一点 emoji
3. 长度适中（50-150字）
4. 不要包含违规词汇（最、第一、绝对等）
5. 不要出现未经授权的品牌 logo 或名人代言

请直接输出文案，不要加前缀说明。`;

  const result = await aiGateway.generate({
    taskType: 'text',
    prompt,
  });

  return result.content || '';
}

async function generateImages(
  plan: AccountContentPlan,
  productInfo: ProductInfo
): Promise<string[]> {
  const prompt = `为以下产品生成一张推广图片。

产品：${productInfo.name}
描述：${productInfo.description}
内容角度：${plan.contentAngle}
目标人群：${plan.targetAudience}

要求：
1. 图片要有吸引力，符合产品调性
2. 可以使用产品图片作为素材
3. 风格要适合抖音平台

请输出 JSON 格式：{"images": [{"url": "图片URL"}]} 或 {"images": []}（如果无法生成）`;

  try {
    const result = await aiGateway.generate({
      taskType: 'image',
      prompt,
    });

    // 尝试解析 JSON
    const parsed = JSON.parse(result.content || '{}');
    if (parsed.images && Array.isArray(parsed.images)) {
      return parsed.images.map((img: any) => img.url).filter(Boolean);
    }
  } catch (e) {
    log.warn('[ContentExecutor] 图片生成失败:', e);
  }

  // 如果有产品图片，使用产品图片
  if (productInfo.images && productInfo.images.length > 0) {
    return productInfo.images.slice(0, 3);
  }

  return [];
}

async function generateVideo(
  plan: AccountContentPlan,
  productInfo: ProductInfo
): Promise<string | undefined> {
  const prompt = `为以下产品生成一个短视频创意描述。

产品：${productInfo.name}
描述：${productInfo.description}
内容角度：${plan.contentAngle}
目标人群：${plan.targetAudience}

要求：
1. 视频要有吸引力，能引发用户兴趣
2. 时长 15-60 秒
3. 符合抖音平台风格
4. 提供完整的视频脚本或创意描述

请直接输出视频创意描述。`;

  try {
    const result = await aiGateway.generate({
      taskType: 'video',
      prompt,
    });
    return result.content || undefined;
  } catch (e) {
    log.warn('[ContentExecutor] 视频生成失败:', e);
    return undefined;
  }
}

async function generateVoiceover(text: string): Promise<string | undefined> {
  try {
    const result = await aiGateway.generate({
      taskType: 'voice',
      prompt: `为以下文案生成配音文本（只需要返回要朗读的文本，不要其他说明）:\n\n${text}`,
    });
    return result.content || undefined;
  } catch (e) {
    log.warn('[ContentExecutor] 配音生成失败:', e);
    return undefined;
  }
}

async function generateHashtags(
  plan: AccountContentPlan,
  productInfo: ProductInfo,
  text: string,
  accountTags?: string[]
): Promise<string[]> {
  const accountTagsSection = accountTags && accountTags.length > 0
    ? `\n账号标签：${accountTags.join(', ')}` : '';
  const prompt = `为以下抖音文案生成 3-5 个合适的 Hashtag（以 # 开头，用空格分隔）：

文案：${text}
产品：${productInfo.name}
内容角度：${plan.contentAngle}${accountTagsSection}

要求：
1. 要跟文案内容相关
2. 要跟账号标签风格匹配${accountTagsSection ? '\n3. 优先使用与账号标签相关的热门话题' : '\n3. 不要太多，3-5 个就好'}
4. 不要太多，3-5 个就好

直接输出 Hashtag，用空格分隔。`;

  try {
    const result = await aiGateway.generate({
      taskType: 'text',
      prompt,
    });

    // 解析 hashtag
    const hashtags = result.content
      ?.match(/#[\w\u4e00-\u9fa5]+/g)
      ?.slice(0, 5) || [];

    // 加上策略里已有的 hint
    const hints = plan.hashtagHints || [];
    return [...new Set([...hashtags, ...hints])].slice(0, 5);
  } catch (e) {
    log.warn('[ContentExecutor] Hashtag 生成失败:', e);
    return plan.hashtagHints?.slice(0, 5) || [];
  }
}
