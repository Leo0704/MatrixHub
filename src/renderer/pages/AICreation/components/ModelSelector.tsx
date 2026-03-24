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

const formatProvider = (p: string): string => {
  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    zhipu: '智谱',
    minimax: 'MiniMax',
    kimi: 'Kimi',
    qwen: 'Qwen',
    doubao: '豆包',
  };
  return providerNames[p] || p.charAt(0).toUpperCase() + p.slice(1);
};

interface ModelSelectorProps {
  platform: Platform;
  model: string;
  onChange: (model: string) => void;
}

export function ModelSelector({ platform, model, onChange }: ModelSelectorProps) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <label style={labelStyle}>AI 模型</label>
      <select
        className="input"
        value={model}
        onChange={e => onChange(e.target.value)}
      >
        {AI_MODELS[platform].map(m => (
          <option key={m.id} value={m.id}>
            {m.name} ({formatProvider(m.provider)})
          </option>
        ))}
      </select>
    </div>
  );
}

export { AI_MODELS, formatProvider };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)'
};
