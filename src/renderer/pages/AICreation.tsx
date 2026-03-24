import { useState } from 'react';
import type { Platform } from '~shared/types';
import PublishModal from '../components/PublishModal';
import { useToast } from '../components/Toast';

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
  { id: '5', name: '知识教程', desc: '生成教学类、科普类内容' },
  { id: '6', name: '热点评论', desc: '对热点事件的评论分析' },
  { id: '7', name: '故事叙事', desc: '个人经历、品牌故事分享' },
  { id: '8', name: '日常Vlog', desc: '生活方式、Vlog脚本分享' },
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
格式示例：#话题1 #话题2 #话题3

---
要求：输出可直接使用的文案，直接复制就能拍视频`;
  },

  '2': (topic, _platform) => {
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

  '3': (topic, _platform) => {
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

  '4': (topic, _platform) => {
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

  '5': (topic, _platform) => {
    // 知识教程
    return `📚 【知识教程内容生成】

主题：${topic}

请生成让人想学完的教程内容：

【开场钩子】
用一个痛点问题或惊人事实开头
"你是不是也遇到过..."
"99%的人都不知道..."
"学会这个，每年多赚XX万"

【知识框架】
把复杂内容拆解成 3-5 个简单步骤
- 每个步骤清晰好记
- 用类比帮助理解
- 加入实际案例

【实操演示】
给出具体可落地的操作方法
- 工具/方法名称
- 操作步骤 1-2-3
- 常见错误提醒

【记忆口诀/金句】
总结一个让人记住的核心观点

【互动引导】
结尾引导关注/收藏
"还想学习更多...？点关注"

【相关标签】
生成 5-8 个相关话题标签

---
要求：信息量大、干货足、让人看完有收获感`;
  },

  '6': (topic, _platform) => {
    // 热点评论
    return `🔥 【热点评论内容生成】

热点话题：${topic}

请生成有深度的热点评论内容：

【热点概述】
简要说明热点事件的核心
"最近...刷屏了"
"XX事件引发热议"

【核心观点】
给出你的鲜明立场（1-2句话）
"我认为.../这件事说明..."

【多角度分析】
从不同角度解读事件：
- 表面现象
- 深层原因
- 可能影响

【个人立场】
用真实、接地气的语气表达观点
避免假大空，要有独特视角

【引导讨论】
结尾抛出问题，引导评论区讨论
"你们怎么看？"
"你们遇到过类似的吗？"

【蹭热度技巧】
如果相关，巧妙关联到你的领域/产品

【相关标签】
生成 5-8 个热点相关话题标签

---
要求：反应迅速、观点鲜明、有深度、能引发讨论`;
  },

  '7': (topic, _platform) => {
    // 故事叙事
    return `📖 【故事叙事内容生成】

主题：${topic}

请生成打动人心的故事内容：

【故事开头】
用悬念或共鸣点开头
"那是...的一天"
"我永远记得..."
"从...到...的故事"

【故事背景】
交代时间、地点、人物
让读者快速进入场景

【情节发展】
按时间线或有逻辑的顺序展开
- 遇到什么困难/挑战
- 心理变化过程
- 关键的转折点

【高潮/冲突】
制造冲突和悬念
让人想继续看下去

【结局/感悟】
故事的核心结论
"这个故事告诉我..."

【情感共鸣】
结尾触发情感共鸣
让读者觉得"我也是"

【行动号召】
引导关注/互动
"你们有类似经历吗..."

---
要求：真实感人、有细节、有温度、让人产生共鸣`;
  },

  '8': (topic, _platform) => {
    // 日常Vlog
    return `🎬 【日常Vlog脚本生成】

主题：${topic}

请生成适合Vlog的内容脚本：

【开场】
用"今天..."或状态开场
展示你在做什么
"今天带大家看看..."
"日常plog | ..."

【场景展示】
按顺序展示内容
- 地点/环境
- 正在做的事
- 看到的风景/有趣的事

【生活感细节】
加入真实的生活细节
- 早餐吃了什么
- 路上遇到什么
- 小确幸/小确丧

【旁白/解说】
给出简短的内心独白或解说
"其实今天..."
"顺便说一下..."

【节奏把控】
适当留白，不要太满
停顿/空镜头的处理建议

【结尾】
用日常的方式收尾
"好啦，今天就到这里"
"下期见～"

【BGM建议】
推荐适合的背景音乐风格

---
要求：真实自然、有生活气息、让人看了也想拍`;
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
  const [iterationHistory, setIterationHistory] = useState<{feedback: string; response: string}[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [contentMode, setContentMode] = useState<'text' | 'image' | 'voice'>('text');
  const [imageResult, setImageResult] = useState<{url: string; revisedPrompt?: string} | null>(null);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [voicePrompt, setVoicePrompt] = useState('');
  const { showToast } = useToast();

  const handlePublishSuccess = (taskIds: string[]) => {
    setShowPublishModal(false);
    showToast(`已创建 ${taskIds.length} 个发布任务`, 'success');
  };

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

  const handleIterate = async (feedback: string) => {
    if (!result) return;
    setGenerating(true);
    try {
      const response = await window.electronAPI?.iterateAI({
        originalPrompt: CONTENT_PROMPTS[promptType]?.(topic, platform) || `主题：${topic}`,
        originalResponse: result,
        feedback,
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

  const handleGenerateImage = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setImageResult(null);

    try {
      const selectedModel = AI_MODELS[platform].find(m => m.id === model);
      if (!selectedModel) {
        setResult('错误：未找到选择的模型');
        return;
      }

      const response = await window.electronAPI?.generateAI({
        taskType: 'image',
        providerType: selectedModel.provider,
        model: 'dall-e-3',
        prompt: topic,
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

  const handleGenerateVoice = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setVoiceResult(null);

    try {
      const selectedModel = AI_MODELS[platform].find(m => m.id === model);
      if (!selectedModel) {
        setResult('错误：未找到选择的模型');
        return;
      }

      const prompt = CONTENT_PROMPTS[promptType]?.(topic, platform) ||
        `请将以下内容转换为语音：${topic}`;

      const response = await window.electronAPI?.generateAI({
        taskType: 'voice',
        providerType: selectedModel.provider,
        model: 'tts-1',
        prompt: prompt,
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

          {/* 内容模式选择 */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>内容类型</label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                className={`btn ${contentMode === 'text' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => setContentMode('text')}
              >
                📝 文案
              </button>
              <button
                className={`btn ${contentMode === 'image' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => setContentMode('image')}
              >
                🖼️ 图片
              </button>
              <button
                className={`btn ${contentMode === 'voice' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => setContentMode('voice')}
              >
                🔊 语音
              </button>
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
            onClick={() => {
              if (contentMode === 'text') handleGenerate();
              else if (contentMode === 'image') handleGenerateImage();
              else if (contentMode === 'voice') handleGenerateVoice();
            }}
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
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setIsEditing(!isEditing);
                    setEditedContent(result);
                  }}
                >
                  {isEditing ? '✓ 完成编辑' : '编辑'}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    if (!result && !imageResult && !voiceResult) return;
                    setShowPublishModal(true);
                  }}
                >
                  一键发布
                </button>
              </div>
            )}
          </div>

          {/* 根据 contentMode 显示不同的结果 */}
          {contentMode === 'image' ? (
            !imageResult ? (
              <div className="empty-state" style={{ height: 300 }}>
                <div style={{ fontSize: 48, opacity: 0.5 }}>🖼️</div>
                <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-md)' }}>
                  {generating ? 'AI 正在生成图片...' : '生成的图片将显示在这里'}
                </p>
              </div>
            ) : (
              <div>
                <img
                  src={imageResult.url}
                  alt="Generated"
                  style={{ maxWidth: '100%', borderRadius: 'var(--radius)' }}
                />
                {imageResult.revisedPrompt && (
                  <p style={{ marginTop: 'var(--space-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
                    修订后的描述：{imageResult.revisedPrompt}
                  </p>
                )}
              </div>
            )
          ) : contentMode === 'voice' ? (
            !voiceResult ? (
              <div className="empty-state" style={{ height: 300 }}>
                <div style={{ fontSize: 48, opacity: 0.5 }}>🔊</div>
                <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-md)' }}>
                  {generating ? 'AI 正在生成语音...' : '生成的语音将显示在这里'}
                </p>
              </div>
            ) : (
              <div>
                <audio
                  src={`data:audio/mp3;base64,${voiceResult}`}
                  controls
                  style={{ width: '100%' }}
                />
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 'var(--space-md)', width: '100%' }}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = `data:audio/mp3;base64,${voiceResult}`;
                    link.download = `voice_${Date.now()}.mp3`;
                    link.click();
                  }}
                >
                  下载音频
                </button>
              </div>
            )
          ) : (
            !result ? (
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
            ) : isEditing ? (
              <textarea
                value={editedContent}
                onChange={e => setEditedContent(e.target.value)}
                onBlur={() => {
                  setResult(editedContent);
                  setIsEditing(false);
                }}
                style={{
                  width: '100%',
                  minHeight: 300,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  lineHeight: 1.8,
                  padding: 'var(--space-md)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  resize: 'vertical'
                }}
              />
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
            )
          )}

          {/* 迭代优化按钮 - 仅文本模式 */}
          {contentMode === 'text' && result && !isEditing && (
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                快速优化：
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => handleIterate('太正式了，改口语化')}
                  disabled={generating}
                >
                  太正式
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => handleIterate('太长了，缩短一半')}
                  disabled={generating}
                >
                  太长了
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => handleIterate('不够吸引人，优化开头')}
                  disabled={generating}
                >
                  开头弱
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => handleIterate('再加一些梗或金句')}
                  disabled={generating}
                >
                  加梗
                </button>
              </div>
            </div>
          )}

          {/* 迭代历史 - 仅文本模式 */}
          {contentMode === 'text' && iterationHistory.length > 0 && (
            <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                迭代历史
              </div>
              {iterationHistory.map((item, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 'var(--space-xs)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>"{item.feedback}"</span>
                  {' → '}
                  <span style={{ color: 'var(--success)' }}>已优化</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 发布弹窗 */}
      {showPublishModal && (
        <PublishModal
          isOpen={showPublishModal}
          platform={platform}
          title={contentMode === 'image' ? imagePrompt : contentMode === 'voice' ? voicePrompt : topic}
          content={contentMode === 'image' && imageResult?.url ? imageResult.url : contentMode === 'voice' && voiceResult ? voiceResult : result || ''}
          onClose={() => setShowPublishModal(false)}
          onPublished={handlePublishSuccess}
        />
      )}
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
