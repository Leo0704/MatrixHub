import { useState } from 'react';
import type { Platform } from '../types';

const AI_MODELS = {
  douyin: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'claude-3-5', name: 'Claude 3.5', provider: 'Anthropic' },
  ],
  kuaishou: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'claude-3-5', name: 'Claude 3.5', provider: 'Anthropic' },
  ],
  xiaohongshu: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'claude-3-5', name: 'Claude 3.5', provider: 'Anthropic' },
    { id: 'glm-4', name: 'GLM-4', provider: 'Zhipu' },
  ],
};

const PROMPT_TEMPLATES = [
  { id: '1', name: '短视频脚本', desc: '生成吸引人的短视频文案脚本' },
  { id: '2', name: '种草文案', desc: '生成小红书风格种草推荐文案' },
  { id: '3', name: '热点追踪', desc: '分析当前热点生成相关内容建议' },
  { id: '4', name: '评论区回复', desc: '生成互动性强的评论回复' },
];

export default function AICreation() {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [model, setModel] = useState('gpt-4o');
  const [promptType, setPromptType] = useState('1');
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setResult(null);

    // 模拟生成
    await new Promise(resolve => setTimeout(resolve, 2000));

    setResult(`【${topic}】短视频脚本\n\n开头（0-3秒）：\n吸引眼球的画面 + 悬念文案\n"你有没有发现..."\n\n正文（3-55秒）：\n1. 提出问题/痛点\n2. 给出解决方案\n3. 展示效果对比\n\n结尾（55-60秒）：\n"关注我，每天分享干货技巧"\n\n#标签：#短视频技巧 #干货分享 #知识创作`);
    setGenerating(false);
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
                <button className="btn btn-ghost" style={{ fontSize: 12 }}>
                  复制
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
                {generating ? 'AI 正在思考中...' : '生成结果将显示在这里'}
              </p>
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
