/**
 * @deprecated 此文件仅用于向后兼容
 * 新代码请使用 src/service/prompt-builder.ts
 */
import type { Platform } from '../../shared/types.js';
import { buildCreativePrompt, getEnhancedSystemPrompt } from '../prompt-builder.js';

/**
 * AI 生成 Prompt 模板
 */
export const PROMPT_TEMPLATES: Record<string, string> = {
  default: `主题: {topic}\n\n请生成相关内容的脚本或文案。`,
  script: `为以下主题生成一个吸引人的短视频脚本:
{topic}

要求:
1. 开头有悬念/钩子
2. 正文有清晰的逻辑结构
3. 结尾有call-to-action
4. 总时长控制在60秒以内`,
  promotion: `为以下产品/主题生成种草文案:
{topic}

要求:
1. 口语化、亲切
2. 突出亮点
3. 引发共鸣`,
  '5': `为以下主题生成知识教程内容:
{topic}

要求:
1. 用痛点问题开头引发兴趣
2. 拆解成简单易懂的步骤
3. 给出具体可落地的操作方法
4. 结尾引导关注/收藏`,
  '6': `对以下热点事件生成评论内容:
{topic}

要求:
1. 简要说明热点事件
2. 给出鲜明的核心观点
3. 多角度分析
4. 引导评论区讨论`,
  '7': `为以下主题生成故事叙事内容:
{topic}

要求:
1. 用悬念或共鸣点开头
2. 按时间线展开情节
3. 制造冲突和悬念
4. 触发情感共鸣
5. 引导互动`,
  '8': `为以下主题生成Vlog脚本:
{topic}

要求:
1. 真实自然的开场
2. 场景展示+旁白解说
3. 加入生活感细节
4. 适当的节奏把控
5. 日常感的结尾收尾`,
};

/**
 * 系统 Prompt（按平台）
 */
export const SYSTEM_PROMPTS: Record<string, string> = {
  douyin: '你是一个专业的抖音内容创作者，熟悉短视频节奏和算法偏好。生成的内容要吸引眼球、有节奏感。',
};

// 保留原始导出名（用于向后兼容）
export function buildPrompt(type: string, topic: string): string {
  console.warn('[deprecated] config/prompts.ts buildPrompt is deprecated, use prompt-builder.js');
  return buildCreativePrompt(type as any, topic, 'douyin');
}

export function getSystemPrompt(platform?: Platform): string {
  console.warn('[deprecated] config/prompts.ts getSystemPrompt is deprecated, use prompt-builder.js');
  return getEnhancedSystemPrompt(platform ?? 'douyin');
}

/**
 * 内容类型 JSON Schema（用于结构化输出）
 */
export const CONTENT_SCHEMAS: Record<string, Record<string, string>> = {
  script: {
    title: "string - 短视频标题",
    hook: "string - 黄金3秒开头",
    content: "string - 正文内容",
    cta: "string - 结束语+行动号召",
    tags: "array - 话题标签",
    duration: "number - 预估时长(秒)"
  },
  promotion: {
    title: "string - 种草标题",
    content: "string - 正文内容",
    highlights: "array - 核心亮点",
    tags: "array - 话题标签"
  },
  review: {
    title: "string - 测评标题",
    pros: "array - 优点列表",
    cons: "array - 缺点列表",
    rating: "number - 评分(1-5)",
    conclusion: "string - 总结"
  },
  discussion: {
    question: "string - 引发讨论的问题",
    perspectives: "array - 不同角度的观点",
    cta: "string - 引导评论"
  },
  tutorial: {
    title: "string - 教程标题",
    steps: "array - 步骤列表",
    tips: "array - 技巧提示",
    conclusion: "string - 总结"
  },
  hot_comment: {
    event: "string - 热点事件概述",
    viewpoint: "string - 核心观点",
    analysis: "array - 多角度分析",
    cta: "string - 引导讨论"
  },
  story: {
    title: "string - 故事标题",
    beginning: "string - 故事开头",
    development: "string - 情节发展",
    climax: "string - 高潮",
    ending: "string - 结局/感悟"
  },
  vlog: {
    title: "string - Vlog标题",
    scenes: "array - 场景描述",
    narration: "string - 旁白/解说",
    bgm: "string - 背景音乐建议"
  },
  default: {
    title: "string - 标题",
    content: "string - 内容",
    tags: "array - 话题标签"
  }
};
