import { useState } from 'react';
import type { Platform } from '~shared/types';

type AIProvider = 'openai' | 'anthropic' | 'zhipu' | 'deepseek' | 'minimax' | 'kimi' | 'qwen' | 'doubao';

const AI_MODELS: Record<Platform, { id: string; name: string; provider: AIProvider }[]> = {
  douyin: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek' },
  ],
  kuaishou: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek' },
  ],
  xiaohongshu: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'glm-4', name: 'GLM-4', provider: 'zhipu' },
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek' },
  ],
};

const PROMPT_TEMPLATES = [
  { id: '1', name: '短视频脚本', desc: '生成吸引人的短视频文案脚本' },
  { id: '2', name: '种草文案', desc: '生成小红书风格种草推荐文案' },
  { id: '3', name: '产品测评', desc: '生成真实体验感测评文案' },
  { id: '4', name: '话题讨论', desc: '生成能引发讨论的互动话题' },
];

// 平台系统提示词
const SYSTEM_PROMPTS: Record<Platform, string> = {
  douyin: `你是一个抖音头部MCN机构的资深内容策划专家。
专长：爆款短视频脚本、完播率优化、评论区运营
风格：年轻化、网感强、有记忆点、能引发共鸣
能力：写出让人"哇"一声、忍不住点赞评论转发的文案`,

  kuaishou: `你熟悉快手老铁文化，擅长创作真实、有温度、接地气的内容。
专长：真实生活分享、情感共鸣、社区互动
风格：真实不装、有烟火气、有温度
能力：写出能引发"老铁666"和共鸣的文案`,

  xiaohongshu: `你是小红书头部博主，擅长创作高质感种草文案。
专长：好物分享、生活方式、精致感内容
风格：审美在线、有调性、让人种草
能力：写出让人想购买、有获得感的文案`,
};

// 创作类型提示词模板
const CONTENT_PROMPTS: Record<string, (topic: string, platform: Platform) => string> = {
  '1': (topic, platform) => {
    // 短视频脚本
    const platformEmoji = platform === 'douyin' ? '🎵' : platform === 'kuaishou' ? '📱' : '📕';
    return `${platformEmoji} 【短视频爆款脚本生成】

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
#xxx #xxx #xxx

---
要求：输出可直接使用的文案，直接复制就能拍视频`;
  },

  '2': (topic, platform) => {
    // 种草文案
    return `🌟 【小红书爆款种草文案】

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
要求：真实感、有温度、能引发共鸣，直接可发布`;
  },

  '3': (topic, platform) => {
    // 产品测评
    return `📦 【真实测评文案】

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
要求：真实、有细节、不浮夸，让人看完就想下单`;
  },

  '4': (topic, platform) => {
    // 话题讨论
    return `💬 【互动话题生成】

话题：${topic}

请生成能引发热烈讨论的内容：

【引发共鸣型问题】
提出一个目标群体都会遇到的问题
"你们有没有遇到过..."
"女生/男生是不是都..."

【观点表达型】
给出一个有争议但不过分的观点
"我觉得..."
"真的不是我说..."

【经历分享型】
"你们有没有..."
"原来不止我一个人..."

【评论区互动】
在结尾预留互动点：
- "你们呢？"
- "评论区告诉我"
- "你们遇到过类似的吗？"

---
要求：引发共鸣、留有讨论空间、调动评论区活跃度`;
  },
};

export default function AICreation() {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [model, setModel] = useState('gpt-4o');
  const [promptType, setPromptType] = useState('1');
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败，忽略
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setResult(null);

    try {
      // 获取选中的模型配置
      const selectedModel = AI_MODELS[platform].find(m => m.id === model);
      if (!selectedModel) {
        setResult('错误：未找到选择的模型');
        setGenerating(false);
        return;
      }

      // 构建提示词
      const prompt = CONTENT_PROMPTS[promptType]?.(topic, platform) ||
        `主题：${topic}\n\n请生成相关内容`;
      const systemPrompt = SYSTEM_PROMPTS[platform];

      // 调用真实 AI API
      const response = await window.electronAPI?.generateAI({
        taskType: 'text',
        providerType: selectedModel.provider,
        model: model,
        prompt: prompt,
        system: systemPrompt,
        temperature: 0.7,
        maxTokens: 3000,
      });

      if (response?.success && response.content) {
        setResult(response.content);
      } else {
        setResult(`生成失败：${response?.error || '未知错误'}`);
      }
    } catch (error) {
      setResult(`生成失败：${error instanceof Error ? error.message : '网络错误'}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }}>
      {/* 左侧：配置 */}
      <div>
        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>AI 创作</h3>

          {/* 平台选择 */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>选择平台</label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              {(['douyin', 'kuaishou', 'xiaohongshu'] as Platform[]).map(p => (
                <button
                  key={p}
                  className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: 13 }}
                  onClick={() => setPlatform(p)}
                >
                  {p === 'douyin' ? '🎵 抖音' : p === 'kuaishou' ? '📱 快手' : '📕 小红书'}
                </button>
              ))}
            </div>
          </div>

          {/* 模型选择 */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>AI 模型</label>
            <select
              className="input"
              value={model}
              onChange={e => setModel(e.target.value)}
            >
              {AI_MODELS[platform].map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          {/* 创作类型 */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>创作类型</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
              {PROMPT_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  className={`btn ${promptType === t.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12, justifyContent: 'flex-start', paddingLeft: 'var(--space-md)' }}
                  onClick={() => setPromptType(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* 主题输入 */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>创作主题</label>
            <textarea
              className="input"
              style={{
                width: '100%',
                height: 100,
                padding: 'var(--space-md)',
                resize: 'none',
              }}
              placeholder="输入你想要创作的主题..."
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
          >
            {generating ? '🤖 生成中...' : '✨ 开始生成'}
          </button>
        </div>

        {/* 快捷模板 */}
        <div className="card">
          <h4 style={{ marginBottom: 'var(--space-md)' }}>提示词模板</h4>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: 'var(--space-sm)' }}>
              当前的提示词模板基于最佳实践优化，
              可根据需要调整生成内容的风格和长度。
            </p>
          </div>
        </div>
      </div>

      {/* 右侧：结果 */}
      <div>
        <div className="card" style={{ height: '100%' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-lg)'
          }}>
            <h3>生成结果</h3>
            {result && (
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={handleCopy}
                >
                  {copied ? '✓ 已复制' : '复制'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }}>
                  一键发布
                </button>
              </div>
            )}
          </div>

          {!result ? (
            <div className="empty-state" style={{ height: 300 }}>
              <div style={{ fontSize: 48, opacity: 0.5 }}>🤖</div>
              <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-md)' }}>
                {generating ? 'AI 正在创作中，请稍候...' : '生成结果将显示在这里'}
              </p>
              {generating && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 'var(--space-xs)' }}>
                  根据主题复杂度，可能需要 5-30 秒
                </p>
              )}
            </div>
          ) : (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
              color: 'var(--text-secondary)'
            }}>
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)'
};
