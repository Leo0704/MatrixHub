/**
 * Prompt 模板配置
 */
import type { Platform } from '../../shared/types.js';

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
};

/**
 * 系统 Prompt（按平台）
 */
export const SYSTEM_PROMPTS: Record<string, string> = {
  douyin: '你是一个专业的抖音内容创作者，熟悉短视频节奏和算法偏好。生成的内容要吸引眼球、有节奏感。',
  kuaishou: '你是一个专业的快手内容创作者，熟悉老铁文化和真实感内容。生成的内容要接地气、有温度。',
  xiaohongshu: '你是一个专业的小红书博主，熟悉种草文风和审美标准。生成的内容要有调性、有质感。',
};

/**
 * 构建 Prompt
 */
export function buildPrompt(type: string, topic: string): string {
  const template = PROMPT_TEMPLATES[type] ?? PROMPT_TEMPLATES.default;
  return template.replace('{topic}', topic);
}

/**
 * 获取系统 Prompt
 */
export function getSystemPrompt(platform?: Platform): string {
  return SYSTEM_PROMPTS[platform ?? 'douyin'];
}
