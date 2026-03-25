# AI 内容质量优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决 AI 生成内容（文案、配音、图片、视频）质量差的问题，通过优化 Prompt 模板、增加平台上下文、改进生成参数、完善迭代机制等措施提升输出质量。

**Architecture:** 本计划围绕 Prompt 优化展开：
1. 统一两套冲突的 Prompt 系统（废弃 `config/prompts.ts`，统一使用 `AICreation/constants.ts` 的详细模板）
2. 增强系统提示词，添加平台算法知识和受众描述
3. 在 prompt 中加入 Few-shot 示例提升输出稳定性
4. 为图片/视频/语音生成添加平台上下文
5. 改进迭代优化机制，传递更多历史上下文
6. 优化内容审核，增加质量评估维度

**Tech Stack:** TypeScript, Vitest, Electron

---

## 文件变更概览

### 需要修改的文件

| 文件 | 变更类型 | 职责 |
|------|----------|------|
| `src/service/handlers/ai-generate-handler.ts` | 修改 | 改用详细 Prompt 模板，增加 maxTokens |
| `src/service/config/prompts.ts` | 修改 | 标记为废弃，添加重定向注释 |
| `src/renderer/pages/AICreation/constants.ts` | 修改 | 优化系统提示词，添加 Few-shot 示例 |
| `src/renderer/pages/AICreation/index.tsx` | 修改 | 传递平台上下文到媒体生成 |
| `src/service/content-moderator.ts` | 修改 | 增加质量评分和 AI 味检测 |
| `src/service/prompt-builder.ts` | 新建 | 统一的 Prompt 构建器 |
| `src/renderer/utils/platform-context.ts` | 新建 | 共享的平台上下文辅助函数 |

### 测试文件

| 文件 | 职责 |
|------|------|
| `src/service/handlers/__tests__/ai-generate-handler.test.ts` | 更新测试适配新参数 |
| `src/service/content-moderator.test.ts` | 添加质量评分测试 |
| `src/service/strategy-engine.test.ts` | 可选：更新 prompt 格式测试 |

---

## Task 1: 统一 Prompt 系统

**目标:** 废弃 `config/prompts.ts`，让 `ai-generate-handler.ts` 使用 `AICreation/constants.ts` 的详细模板

**Files:**
- Modify: `src/service/handlers/ai-generate-handler.ts:1-72`
- Modify: `src/service/config/prompts.ts:1-85` (添加废弃标记)
- Test: `src/service/handlers/__tests__/ai-generate-handler.test.ts`

### Steps

- [ ] **Step 1: 查看当前 `config/prompts.ts` 内容**

Run: `cat src/service/config/prompts.ts`

确认需要废弃的模板和函数。

- [ ] **Step 2: 更新 `ai-generate-handler.ts` 使用 constants.ts 的模板**

修改 `src/service/handlers/ai-generate-handler.ts` 的 import 和 prompt 构建逻辑：

```typescript
// 旧导入（需要删除）
// import { buildPrompt, getSystemPrompt } from '../config/prompts.js';

// 新导入：从 renderer 的 constants 导入（通过 service 层暴露）
import { CONTENT_PROMPTS, SYSTEM_PROMPTS } from '../config/prompts-enhanced.js';

// 或者直接在 service 层创建统一的 prompt 构建器
```

实际上需要创建一个新的统一 prompt 构建模块，因为 renderer 不能被 service 直接 import。

**创建:** `src/service/prompt-builder.ts`

```typescript
/**
 * 统一的 Prompt 构建器
 * 整合了原来分散在 config/prompts.ts 和 AICreation/constants.ts 中的模板
 */
import type { Platform } from '../shared/types.js';

export type PromptType = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | 'script' | 'promotion' | 'default';

interface BuildPromptOptions {
  type: PromptType;
  topic: string;
  platform: Platform;
}

/**
 * 构建创作 Prompt（详细模板，替代原来的 config/prompts.ts）
 */
export function buildCreativePrompt(type: PromptType, topic: string, platform: Platform): string {
  const templates: Record<PromptType, (topic: string, platform: Platform) => string> = {
    '1': (topic, platform) => {
      const emoji = platform === 'douyin' ? '🎵' : platform === 'kuaishou' ? '📱' : '📕';
      return `${emoji} 【短视频爆款脚本生成】

主题：${topic}

请按以下结构生成完整的短视频文案：

【黄金3秒开头】
用强烈好奇、冲突或共鸣开头。让人忍不住想看完。
示例：震惊！/没想到.../竟然...
（写出2-3个备选开头）

【内容正文】
用"问题-冲突-解决方案"或"经历分享"结构
- 语言口语化、接地气、有网感
- 加入 2-3 个记忆点/金句
- 适当加入反转或惊喜

【60秒节奏把控】
估算每段的时间分配：
- 开头：X秒
- 正文：X秒
- 结尾：X秒

【魔性结尾+CTA】
结尾留悬念或强CTA，引发评论和关注
示例："想知道后面发生了什么吗？点关注..."
"你们遇到过这种情况吗？评论区告诉我..."

【爆款话题标签】
生成 5-8 个相关话题标签
格式示例：#话题1 #话题2 #话题3

---
要求：输出可直接使用的文案，直接复制就能拍视频`;
    },
    '2': (topic, _platform) => `🌟 【小红书爆款种草文案】

产品/主题：${topic}

请生成高质量种草文案：

【吸睛标题】
生成 3 个不同风格标题：
- 震惊夸张型：救命！/真的绝了！
- 真实分享型：用了三个月...
- 疑问型：还有人不知道这个吗？

【正文结构】
1. 【开头】用"姐妹们！"、"救命！"、"真的绝了！"引发共鸣
2. 【体验分享】第1点...第2点...第3点...
   - 有细节、有感受、有对比
   - 突出1-2个核心亮点
3. 【结尾CTA】"真的好用！"、"姐妹们冲！"引发购买欲望

【排版规范】
- 每段不超过3行
- 适当用emoji增加活力
- 重要信息用符号突出

---
要求：真实感、有温度、能引发共鸣，直接可发布`,
    '3': (topic, _platform) => `📦 【真实测评文案】

产品：${topic}

请生成让人信服的测评文案：

【测评背景】
简短介绍怎么得到的、用了多久

【测评体验 - 优缺点】
⭐ 优点：
1. ...
2. ...
3. ...

⚠️ 小缺点：
（诚实地写1-2个无伤大雅的缺点，显示真实性）

【使用技巧/心得】
分享 2-3 个别人不知道的小技巧

【适合人群】
明确指出适合谁、不适合谁

【总结】
一句话概括值不值得买

---
要求：真实、有细节、不浮夸，让人看完就想下单`,
    '4': (topic, _platform) => `💬 【互动话题生成】

话题：${topic}

请生成能引发热烈讨论的内容：

【引发共鸣型问题】
提出一个目标群体都会遇到的问题

【观点表达型】
给出一个有争议但不过分的观点

【经历分享型】
"你们有没有..."

【评论区互动】
在结尾预留互动点

---
要求：引发共鸣、留有讨论空间、调动评论区活跃度`,
    '5': (topic, _platform) => `📚 【知识教程内容生成】

主题：${topic}

请生成让人想学完的教程内容：

【开场钩子】
用一个痛点问题或惊人事实开头

【知识框架】
把复杂内容拆解成 3-5 个简单步骤

【实操演示】
给出具体可落地的操作方法

【记忆口诀/金句】
总结一个让人记住的核心观点

【互动引导】
结尾引导关注/收藏

【相关标签】
生成 5-8 个相关话题标签

---
要求：信息量大、干货足、让人看完有收获感`,
    '6': (topic, _platform) => `🔥 【热点评论内容生成】

热点话题：${topic}

请生成有深度的热点评论内容：

【热点概述】
简要说明热点事件的核心

【核心观点】
给出你的鲜明立场

【多角度分析】
从不同角度解读事件

【引导讨论】
结尾抛出问题，引导评论区讨论

【蹭热度技巧】
如果相关，巧妙关联到你的领域/产品

【相关标签】
生成 5-8 个热点相关话题标签

---
要求：反应迅速、观点鲜明、有深度、能引发讨论`,
    '7': (topic, _platform) => `📖 【故事叙事内容生成】

主题：${topic}

请生成打动人心的故事内容：

【故事开头】
用悬念或共鸣点开头

【故事背景】
交代时间、地点、人物

【情节发展】
按时间线或有逻辑的顺序展开

【高潮/冲突】
制造冲突和悬念

【结局/感悟】
故事的核心结论

【情感共鸣】
结尾触发情感共鸣

【行动号召】
引导关注/互动

---
要求：真实感人、有细节、有温度、让人产生共鸣`,
    '8': (topic, _platform) => `🎬 【日常Vlog脚本生成】

主题：${topic}

请生成适合Vlog的内容脚本：

【开场】
用"今天..."或状态开场

【场景展示】
按顺序展示内容

【生活感细节】
加入真实的生活细节

【旁白/解说】
给出简短的内心独白或解说

【节奏把控】
适当留白，不要太满

【结尾】
用日常的方式收尾

【BGM建议】
推荐适合的背景音乐风格

---
要求：真实自然、有生活气息、让人看了也想拍`,
    // 兼容原有 config/prompts.ts 的类型
    'script': (topic, _platform) => `为以下主题生成一个吸引人的短视频脚本:
${topic}

要求:
1. 开头有悬念/钩子
2. 正文有清晰的逻辑结构
3. 结尾有call-to-action
4. 总时长控制在60秒以内`,
    'promotion': (topic, _platform) => `为以下产品/主题生成种草文案:
${topic}

要求:
1. 口语化、亲切
2. 突出亮点
3. 引发共鸣`,
    'default': (topic, platform) => {
      const emoji = platform === 'douyin' ? '🎵' : platform === 'kuaishou' ? '📱' : '📕';
      return `${emoji} 【内容生成】

主题：${topic}

请生成相关内容，要求：
1. 语言口语化、接地气
2. 有记忆点/金句
3. 引发共鸣
4. 结尾有CTA

---
直接输出内容，不要解释`;
    }
  };

  const builder = templates[type] || templates['default'];
  return builder(topic, platform);
}

/**
 * 获取平台系统提示词（增强版）
 */
export function getEnhancedSystemPrompt(platform: Platform): string {
  const prompts: Record<Platform, string> = {
    douyin: `你是一个抖音头部MCN机构的资深内容策划专家。

专长：
- 爆款短视频脚本创作（完播率优化、互动率提升）
- 抖音算法偏好分析（流量池机制、标签匹配）
- 评论区运营策略

受众：18-30岁年轻人，追求潮流、有娱乐需求

风格要求：
- 年轻化、网感强、有记忆点
- 前3秒必须有强钩子
- 节奏快、信息密度高
- 能引发"哇"的一声或强烈共鸣

爆款标准：
1. 开头3秒必须抓人（好奇/冲突/共鸣）
2. 每15秒有一个小高潮或转折
3. 结尾留悬念或强CTA
4. 标题和封面决定点击率`,
    kuaishou: `你熟悉快手老铁文化，擅长创作真实、有温度、接地气的内容。

专长：
- 真实生活分享（不装、自然）
- 情感共鸣创作（友情、亲情、爱情）
- 社区互动策略

受众：25-45岁三四线城市用户，重视真实性和亲和力

风格要求：
- 真实不装、有烟火气、有温度
- 讲述普通人故事
- 引发"老铁666"式共鸣
- 口语化、亲切感

爆款标准：
1. 真实感 > 精致感
2. 情感共鸣 > 信息量
3. 评论区互动是关键`,
    xiaohongshu: `你是小红书头部博主，擅长创作高质感种草文案。

专长：
- 好物分享、生活方式类内容
- 精致感与真实感平衡
- 种草文案（让人想购买）

受众：18-35岁女性，追求品质生活、有消费能力

风格要求：
- 审美在线、有调性
- 精致但不做作
- 有获得感、让人种草
- 排版美观、图文配合

爆款标准：
1. 封面和标题决定点击率
2. 第一句话要引发好奇
3. 有具体细节和数据支撑
4. 结尾CTA引导互动`
  };

  return prompts[platform] || prompts.douyin;
}

/**
 * 获取图片生成的系统提示词
 */
export function getImageSystemPrompt(platform: Platform): string {
  const prompts: Record<Platform, string> = {
    douyin: '生成适合抖音的视频封面图，要求：色彩鲜艳、抓人眼球、有悬念感，适合短视频平台',
    kuaishou: '生成适合快手的封面图，要求：真实感、接地气、有亲和力，符合老铁文化',
    xiaohongshu: '生成适合小红书的图片，要求：高质感、审美在线、有精致感，符合平台调性'
  };
  return prompts[platform] || prompts.douyin;
}

/**
 * 获取语音合成的提示词优化
 */
export function getVoicePromptEnhancement(platform: Platform): string {
  const prompts: Record<Platform, string> = {
    douyin: '配音要年轻化、有活力、节奏感强，适合短视频',
    kuaishou: '配音要亲切自然、接地气，像朋友聊天',
    xiaohongshu: '配音要有质感、温柔亲切，像闺蜜分享'
  };
  return prompts[platform] || prompts.douyin;
}
```

- [ ] **Step 3: 更新 `ai-generate-handler.ts` 使用新的 prompt 构建器**

```typescript
// 修改 import
import { buildCreativePrompt, getEnhancedSystemPrompt } from '../prompt-builder.js';
// 删除旧的 import: import { buildPrompt, getSystemPrompt } from '../config/prompts.js';

// 修改 executeAIGenerateTask 中的 prompt 构建
const request: AIRequest = {
  providerType: providerType as AIProviderType,
  model: payload.model ?? defaultProvider?.models[0],
  prompt: buildCreativePrompt(
    (payload.promptType ?? 'default') as any,
    payload.topic ?? '',
    payload.platform ?? 'douyin'
  ),
  system: getEnhancedSystemPrompt(payload.platform ?? 'douyin'),
  temperature: payload.temperature ?? 0.7,
  maxTokens: 6000,  // 从 2000 增加到 6000（完整短视频脚本需要更多 token）
};
```

- [ ] **Step 4: 在 `config/prompts.ts` 添加废弃标记**

```typescript
/**
 * @deprecated 请使用 src/service/prompt-builder.ts 中的统一构建器
 * 此文件将在未来版本移除
 */
import { buildPrompt, getSystemPrompt } from './prompt-builder.js';
export { buildPrompt, getSystemPrompt };
```

实际上需要保留向后兼容，所以：

```typescript
// src/service/config/prompts.ts

/**
 * @deprecated 此文件仅用于向后兼容
 * 新代码请使用 src/service/prompt-builder.ts
 */
export const PROMPT_TEMPLATES = { /* 保留原内容 */ };
export const SYSTEM_PROMPTS = { /* 保留原内容 */ };

// 添加重定向函数
import { buildCreativePrompt as _buildCreativePrompt, getEnhancedSystemPrompt as _getEnhancedSystemPrompt } from '../prompt-builder.js';

export function buildPrompt(type: string, topic: string): string {
  console.warn('[deprecated] config/prompts.ts buildPrompt is deprecated, use prompt-builder.js');
  return _buildCreativePrompt(type as any, topic, 'douyin');
}

export function getSystemPrompt(platform?: any): string {
  console.warn('[deprecated] config/prompts.ts getSystemPrompt is deprecated, use prompt-builder.js');
  return _getEnhancedSystemPrompt(platform ?? 'douyin');
}
```

- [ ] **Step 5: 更新测试 mock**

`ai-generate-handler.test.ts` 当前 mock 的是 `config/prompts.js`，需要改为 mock `prompt-builder.js`：

```typescript
// 修改 vi.mock
vi.mock('../../prompt-builder.js', () => ({
  buildCreativePrompt: vi.fn().mockReturnValue('built prompt'),
  getEnhancedSystemPrompt: vi.fn().mockReturnValue('system prompt'),
}));
```

- [ ] **Step 6: 运行测试验证**

Run: `npm test -- --run src/service/handlers/__tests__/ai-generate-handler.test.ts`

Expected: 测试应该通过，如果失败根据错误调整。

- [ ] **Step 6: 提交代码**

```bash
git add src/service/handlers/ai-generate-handler.ts src/service/config/prompts.ts src/service/prompt-builder.ts
git commit -m "refactor: unify prompt system with enhanced templates"
```

---

## Task 2: 为媒体生成添加平台上下文

**目标:** 图片/语音/视频生成时传递平台上下文，避免生成的内容不符合平台风格

**Files:**
- Modify: `src/renderer/pages/AICreation/index.tsx`

### Steps

- [ ] **Step 1: 查看当前媒体生成函数**

查看 `handleGenerateImage`、`handleGenerateVoice`、`handleGenerateVideo` 的当前实现。

- [ ] **Step 2: 修改 `handleGenerateImage` 添加平台上下文**

修改 `src/renderer/pages/AICreation/index.tsx` 第 151-174 行：

```typescript
const handleGenerateImage = async () => {
  if (!topic.trim()) return;
  setGenerating(true);
  setImageResult(null);

  try {
    // 构建包含平台上下文的 prompt
    const platformContext = getPlatformImageContext(platform);
    const enhancedPrompt = `${platformContext}\n\n主题：${topic}\n\n请生成一张高质量图片，描述要详细具体，包括：\n- 画面主体和构图\n- 色彩风格\n- 氛围和情绪\n- 技术参数（如角度、光线等）`;

    const response = await window.electronAPI?.generateAI({
      taskType: 'image',
      providerType: mediaProvider.type as any,
      model: mediaProvider.model || 'dall-e-3',
      prompt: enhancedPrompt,
      system: getImageSystemPrompt(platform),
    });

    if (response?.success && response.content) {
      const data = JSON.parse(response.content);
      setImageResult(data);
      setImagePrompt(topic);
    } else {
      setResult(`生成失败：${response?.error || '未知错误'}`);
    }
  } finally {
    setGenerating(false);
  }
};

// 在文件顶部或合适位置添加辅助函数
function getPlatformImageContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '这是抖音平台的图片创作。抖音用户喜欢：色彩鲜艳、视觉冲击力强、有趣好玩的画面。封面图要能在0.5秒内抓住用户眼球。',
    kuaishou: '这是快手平台的图片创作。快手用户喜欢：真实感、接地气、有故事性的画面。避免过度精致，追求自然和亲和力。',
    xiaohongshu: '这是小红书平台的图片创作。小红书用户喜欢：高颜值、精致感、有审美价值的画面。色调要高级感，排版要美观。'
  };
  return contexts[platform] || contexts.douyin;
}

function getImageSystemPrompt(platform: Platform): string {
  const prompts: Record<Platform, string> = {
    douyin: '你是一个抖音视觉创作专家，擅长生成符合抖音平台风格的图片，要求：色彩鲜艳、视觉冲击强、有趣抓眼球。',
    kuaishou: '你是一个快手视觉创作专家，擅长生成符合快手平台风格的图片，要求：真实感、接地气、有故事性。',
    xiaohongshu: '你是一个小红书视觉创作专家，擅长生成符合小红书平台风格的图片，要求：高颜值、精致感、有审美价值。'
  };
  return prompts[platform] || prompts.douyin;
}
```

- [ ] **Step 3: 修改 `handleGenerateVoice` 添加平台上下文**

修改 `handleGenerateVoice` 传递更丰富的上下文：

```typescript
const handleGenerateVoice = async () => {
  if (!topic.trim()) return;
  setGenerating(true);
  setVoiceResult(null);

  try {
    // 构建配音专用的内容 prompt
    const voiceContext = getVoiceContext(platform);
    const prompt = CONTENT_PROMPTS[promptType]?.(topic, platform) ||
      `主题：${topic}\n\n请将以下内容转换为语音：\n\n${voiceContext}`;

    const response = await window.electronAPI?.generateAI({
      taskType: 'voice',
      providerType: mediaProvider.type as any,
      model: mediaProvider.model || 'tts-1',
      prompt: prompt,
      // 语音生成目前不支持 system 参数，但我们可以把平台信息加入 prompt
    });

    if (response?.success && response.content) {
      setVoiceResult(response.content);
      setVoicePrompt(topic);
    } else {
      setResult(`生成失败：${response?.error || '未知错误'}`);
    }
  } finally {
    setGenerating(false);
  }
};

function getVoiceContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '配音风格要求：年轻化、有活力、节奏感强。适合快节奏的短视频，内容要简洁有力。',
    kuaishou: '配音风格要求：亲切自然、接地气。像是朋友在和你聊天，不要太正式。',
    xiaohongshu: '配音风格要求：有质感、温柔亲切。像是闺蜜在分享心得，有代入感。'
  };
  return contexts[platform] || contexts.douyin;
}
```

- [ ] **Step 4: 修改 `handleGenerateVideo` 添加平台上下文**

```typescript
const handleGenerateVideo = async () => {
  if (!topic.trim()) return;
  setGenerating(true);
  setVideoResult(null);

  try {
    // 构建视频生成的上下文 prompt
    const videoContext = getVideoContext(platform);
    const enhancedPrompt = `${videoContext}\n\n主题：${topic}\n\n请生成视频创作描述，包括：\n1. 视频类型和风格\n2. 主要场景和镜头\n3. 节奏和转场建议\n4. 配乐风格建议`;

    const response = await window.electronAPI?.generateAI({
      taskType: 'video',
      providerType: mediaProvider.type as any,
      model: mediaProvider.model || '',
      prompt: enhancedPrompt,
    });

    if (response?.success && response.content) {
      const data = JSON.parse(response.content);
      setVideoResult(data.url || data.videoUrl || response.content);
    } else {
      setResult(`生成失败：${response?.error || '未知错误'}`);
    }
  } finally {
    setGenerating(false);
  }
};

function getVideoContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '这是抖音视频创作。抖音是一个短视频平台，内容要：1）前3秒必须有强钩子 2）节奏快、信息密集 3）结尾留悬念或强CTA 4）适合竖屏9:16格式。',
    kuaishou: '这是快手视频创作。快手用户喜欢：真实感、有故事性、接地气的内容。可以有更多时间展开，适合有温度的叙事。',
    xiaohongshu: '这是小红书视频创作。小红书视频要求：1）高颜值、精致感 2）内容有干货价值 3）适合生活方式类内容 4）竖屏或方形皆可。'
  };
  return contexts[platform] || contexts.douyin;
}
```

- [ ] **Step 5: 提交代码**

```bash
git add src/renderer/pages/AICreation/index.tsx
git commit -m "feat: add platform context to media generation prompts"
```

---

## Task 3: 改进迭代优化机制

**目标:** 在迭代优化时传递更多历史上下文，让 AI 知道之前的改进方向

**Files:**
- Modify: `src/renderer/pages/AICreation/index.tsx`

### Steps

- [ ] **Step 1: 更新 `handleIterate` 传递完整历史**

修改 `src/renderer/pages/AICreation/index.tsx` 第 128-149 行：

```typescript
const handleIterate = async (feedback: string) => {
  if (!result) return;
  // 保存当前内容到撤销栈
  pushToUndoStack(result);
  setGenerating(true);

  try {
    // 构建包含完整迭代历史的 prompt
    const iterationHistoryText = iterationHistory.length > 0
      ? `\n\n=== 迭代历史（${iterationHistory.length}次）===\n${
        iterationHistory.map((h, i) =>
          `第${i + 1}次反馈：${h.feedback}\n第${i + 1}次改进：${h.response.slice(0, 200)}...`
        ).join('\n\n')
      }`
      : '';

    const enhancedIterationPrompt = `【原始请求】
主题：${topic}
平台：${platform}
类型：${promptType}

【用户反馈】
${feedback}

${iterationHistoryText}

【当前内容】
${result}

请根据用户反馈，改进当前内容。注意：
1. 不要重复之前的改进
2. 保持平台风格一致
3. 直接输出改进后的内容，不要解释`;

    const response = await window.electronAPI?.iterateAI({
      originalPrompt: CONTENT_PROMPTS[promptType]?.(topic, platform) || `主题：${topic}`,
      originalResponse: result,
      feedback: enhancedIterationPrompt,
      iterationCount: iterationHistory.length,
    });

    if (response?.success && response.content) {
      const content = response.content;
      setResult(content);
      setEditedContent(content);
      setIterationHistory(prev => [...prev, { feedback, response: content }]);
    }
  } finally {
    setGenerating(false);
  }
};
```

- [ ] **Step 2: 提交代码**

```bash
git add src/renderer/pages/AICreation/index.tsx
git commit -m "feat: enhance iteration with full history context"
```

---

## Task 4: 增强内容审核（质量评分 + AI 味检测）

**目标:** 在内容审核中增加质量评估维度，过滤"AI 味"和模板化内容

**Files:**
- Modify: `src/service/content-moderator.ts`
- Test: `src/service/content-moderator.test.ts`

### Steps

- [ ] **Step 1: 查看当前实现**

Run: `cat src/service/content-moderator.ts`

- [ ] **Step 2: 添加质量评分和 AI 味检测**

```typescript
// src/service/content-moderator.ts

// 基础违规词（保留原有）
const BLOCKED_PATTERNS = [
  '赌博', '博彩', '彩票', '裸聊', '援交', '色情', '黄色',
  '毒品', '大麻', '冰毒', '自杀', '自残',
];

const SENSITIVE_TOPICS = [
  '政治', '领导人', '示威', '游行', '抗议',
];

// 新增：AI 味检测模式
const AI_PATTERNS = [
  '首先', '其次', '最后', '总的来说', '综上所述',
  '值得注意的是', '毫无疑问', '不言而喻',
  '从多个角度来看', '事实上', '实际上',
  '换句话说', '也就是说', '可以说',
  '一方面...另一方面', '首先...然后...最后',
];

// 新增：模板化开头检测
const TEMPLATE_OPENINGS = [
  '大家好，我是', '今天给大家分享',
  '你有没有遇到过', '今天来聊聊',
  '相信很多人都', '大家都知道',
];

interface ModerationResult {
  passed: boolean;
  reasons: string[];
  // 新增质量评分（0-100）
  qualityScore?: number;
  // 新增 AI 味指数（0-1，越高越像 AI）
  aiScore?: number;
}

/**
 * 检测 AI 味
 */
function detectAIScore(content: string): number {
  const lowerContent = content.toLowerCase();
  let score = 0;
  let matches = 0;

  // 检测 AI 常用连接词
  for (const pattern of AI_PATTERNS) {
    if (lowerContent.includes(pattern)) {
      matches++;
    }
  }

  // 检测模板化开头
  for (const opening of TEMPLATE_OPENINGS) {
    if (lowerContent.includes(opening)) {
      matches++;
    }
  }

  // 检测句子长度均匀度（AI 倾向于句子长度相似）
  const sentences = content.split(/[.!?。！？]/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    // 方差小说明句子长度太均匀，可能是 AI
    if (variance < 100) {
      matches++;
    }
  }

  // 检测感叹号密度（AI 喜欢用 !!!）
  const exclamationCount = (content.match(/!{2,}/g) || []).length;
  if (exclamationCount > 2) {
    matches++;
  }

  // 检测括号使用（AI 喜欢用括号补充说明）
  const bracketCount = (content.match(/[（(][^）)]*[）)]/g) || []).length;
  if (bracketCount > 5) {
    matches++;
  }

  // 计算最终分数
  score = Math.min(matches / 8, 1); // 归一化到 0-1
  return score;
}

/**
 * 计算内容质量评分
 */
function calculateQualityScore(content: string): number {
  let score = 50; // 基础分

  // 加分项
  if (content.length >= 100) score += 10;
  if (content.length >= 300) score += 10;
  if (content.includes('#')) score += 5; // 有话题标签
  if (content.includes('？') || content.includes('?')) score += 5; // 有问句
  if (content.includes('...') || content.includes('…')) score += 5; // 有省略号

  // 扣分项
  const aiScore = detectAIScore(content);
  if (aiScore > 0.3) score -= 15;
  if (aiScore > 0.5) score -= 20;

  // 检测重复
  const words = content.split(/\s+/);
  if (words.length > 20) {
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    if (uniqueWords.size / words.length < 0.3) {
      score -= 20;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function moderateContent(content: string): ModerationResult {
  const reasons: string[] = [];
  const lowerContent = content.toLowerCase();

  // 原有违规检测
  for (const pattern of BLOCKED_PATTERNS) {
    if (lowerContent.includes(pattern)) {
      reasons.push(`包含敏感词: ${pattern}`);
    }
  }

  for (const topic of SENSITIVE_TOPICS) {
    if (lowerContent.includes(topic)) {
      reasons.push(`可能涉及敏感话题: ${topic}`);
    }
  }

  // 重复度检测
  const words = content.split(/\s+/);
  if (words.length > 20) {
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    if (uniqueWords.size / words.length < 0.3) {
      reasons.push('内容重复度过高');
    }
  }

  // 新增：AI 味检测（阈值 0.75 减少误报）
  const aiScore = detectAIScore(content);
  if (aiScore > 0.75) {
    reasons.push(`内容可能过于模板化（AI味指数: ${(aiScore * 100).toFixed(0)}%）`);
  }

  // 新增：质量评分
  const qualityScore = calculateQualityScore(content);

  return {
    passed: reasons.length === 0,
    reasons,
    qualityScore,
    aiScore,
  };
}
```

- [ ] **Step 3: 更新测试**

```typescript
// src/service/content-moderator.test.ts

import { moderateContent } from './content-moderator';

describe('ContentModerator', () => {
  it('passes normal content', () => {
    const result = moderateContent('今天天气真好，适合出门散步');
    expect(result.passed).toBe(true);
  });

  it('blocks content with blocked patterns', () => {
    const result = moderateContent('这是一个正常内容包含赌博的信息');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('敏感词');
  });

  it('detects excessive repetition', () => {
    const repeated = Array(25).fill('测试').join(' ');
    const result = moderateContent(repeated);
    expect(result.passed).toBe(false);
  });

  // 新增测试
  describe('AI score detection', () => {
    it('detects high AI pattern content', () => {
      const aiContent = '首先，我们需要从多个角度来看待这个问题。其次，毫无疑问的是，事实上这个问题确实存在。最后，总的来说，我们可以得出结论。';
      const result = moderateContent(aiContent);
      expect(result.aiScore).toBeGreaterThan(0.3);
    });

    it('detects template openings', () => {
      const templateContent = '大家好，我是今天的分享者。今天给大家分享一个重要的话题。首先，其次，最后。';
      const result = moderateContent(templateContent);
      expect(result.aiScore).toBeGreaterThan(0);
    });

    it('passes natural content with lower AI score', () => {
      const naturalContent = '昨天去了一家小店，意外发现超级好吃！老板人很nice，还送了小菜。下次一定再来！';
      const result = moderateContent(naturalContent);
      expect(result.aiScore).toBeLessThan(0.3);
    });
  });

  describe('quality score', () => {
    it('calculates quality score', () => {
      const goodContent = '今天尝试了一个新菜谱，味道还不错！分享一下我的心得：1）火候要控制好；2）调料要适量；3）最重要的是心情~ #美食 #家常菜';
      const result = moderateContent(goodContent);
      expect(result.qualityScore).toBeGreaterThan(50);
    });

    it('penalizes repetitive content', () => {
      const repetitive = Array(30).fill('很好').join(' ');
      const result = moderateContent(repetitive);
      expect(result.qualityScore).toBeLessThan(50);
    });
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `npm test -- --run src/service/content-moderator.test.ts`

Expected: 所有测试通过

- [ ] **Step 5: 提交代码**

```bash
git add src/service/content-moderator.ts src/service/content-moderator.test.ts
git commit -m "feat: enhance content moderation with AI score and quality metrics"
```

---

## Task 5: 优化系统提示词（添加平台算法知识）

**目标:** 让 AI 了解各平台的算法偏好，生成更符合平台调性的内容

**Files:**
- Modify: `src/service/prompt-builder.ts` (已在 Task 1 中创建)
- Modify: `src/renderer/pages/AICreation/constants.ts` (更新 SYSTEM_PROMPTS)

### Steps

- [ ] **Step 1: 更新 `AICreation/constants.ts` 中的系统提示词**

修改 `src/renderer/pages/AICreation/constants.ts` 第 4-19 行：

```typescript
// 平台系统提示词（增强版）
export const SYSTEM_PROMPTS: Record<Platform, string> = {
  douyin: `你是一个抖音头部MCN机构的资深内容策划专家。

【平台算法知识】
- 抖音采用流量池机制，初始流量根据完播率、点赞、评论、转发分配
- 完播率是关键指标，前3秒必须抓人
- 黄金发布时间：12:00-13:30、18:00-19:30、21:00-22:30
- 抖音用户画像：18-30岁，追求潮流、娱乐、猎奇

【爆款内容标准】
1. 开头3秒：必须有强钩子（好奇/冲突/共鸣/震惊）
2. 内容节奏：每15秒有一个小高潮或反转
3. 结尾：留悬念或强CTA（"关注我，下期更精彩"）
4. 标题：决定点击率，要具体、有悬念、带数字

【创作风格】
- 年轻化、网感强、有记忆点
- 口语化、接地气、有共鸣
- 避免说教，保持娱乐性

【禁止】
- 不要开头就说"今天给大家分享..."
- 不要用"首先...其次...最后"这种AI模板
- 不要过度使用感叹号`,
  kuaishou: `你熟悉快手老铁文化，擅长创作真实、有温度、接地气的内容。

【平台算法知识】
- 快手注重社交关系和真实互动，"关注"转化率高
- 重视评论区运营，互动是核心指标
- 老铁文化：真实、不装、有人情味
- 用户画像：25-45岁，三四线城市，重视真实性

【爆款内容标准】
1. 真实感 > 精致感
2. 情感共鸣 > 信息量
3. 讲述普通人故事
4. 评论区互动是关键

【创作风格】
- 真实不装、有烟火气、有温度
- 像朋友聊天，不要太正式
- 可以有口音/方言表达
- 注重"老铁"式互动

【禁止】
- 不要过度精致/完美
- 不要假大空
- 不要用播音腔`,
  xiaohongshu: `你是一个小红书头部博主，擅长创作高质感种草文案。

【平台算法知识】
- 小红书强调"真实分享"，但高颜值内容更受欢迎
- 封面和标题决定点击率
- 收藏/分享是核心指标（代表内容价值）
- 用户画像：18-35岁女性，一二线城市，追求品质生活

【爆款内容标准】
1. 封面：高清、有质感、配色高级
2. 标题：引发好奇/共鸣/攀比
3. 正文：有干货、有细节、有个人特色
4. 排版：美观、分段清晰、图文配合

【创作风格】
- 审美在线、有调性
- 精致但不做作
- 有获得感、让人种草
- 语气亲切，像闺蜜分享

【禁止】
- 不要太官方/说教
- 不要假大空
- 不要过度修图感`
};

// 添加 'default' case（与 '1' 相同）
CONTENT_PROMPTS['default'] = CONTENT_PROMPTS['1'];
```

- [ ] **Step 2: 提交代码**

```bash
git add src/renderer/pages/AICreation/constants.ts
git commit -m "feat: enhance system prompts with platform algorithm knowledge"
```

---

## Task 6: 整合测试验证

**目标:** 运行完整测试套件，确保所有修改正常工作

### Steps

- [ ] **Step 1: 运行所有相关测试**

Run: `npm test -- --run 2>&1 | head -100`

Expected: 所有测试通过

- [ ] **Step 2: 检查类型错误**

Run: `npx tsc --noEmit 2>&1 | head -50`

Expected: 没有新增类型错误

- [ ] **Step 3: 提交最终整合**

```bash
git add -A
git commit -m "feat: complete AI content quality optimization

- Unified prompt system with enhanced templates
- Added platform context for media generation
- Enhanced iteration mechanism with history
- Added AI taste detection and quality scoring
- Improved system prompts with algorithm knowledge"
```

---

## 验收标准

完成上述任务后，验证：

1. **Prompt 统一**: `ai-generate-handler.ts` 使用 `prompt-builder.ts` 的模板
2. **媒体生成**: 图片/语音/视频生成时传递了平台上下文
3. **迭代优化**: `handleIterate` 传递完整迭代历史
4. **内容审核**: 新增 `aiScore` 和 `qualityScore` 字段
5. **系统提示词**: 包含平台算法知识和创作规范
6. **所有测试通过**: `npm test -- --run` 无失败

---

## 后续优化建议（可选）

如果时间和资源允许，可以进一步优化：

1. **Few-shot 示例**: 在 prompt 中添加优秀案例
2. **模型选择优化**: 根据内容类型推荐最佳模型
3. **A/B 测试**: 跟踪不同 prompt 模板的效果
4. **用户反馈学习**: 根据用户采纳情况调整 prompt
