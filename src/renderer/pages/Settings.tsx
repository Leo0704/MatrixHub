import { useState, useEffect } from 'react';

type AIProvider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  models: string[];
  isDefault: boolean;
  status: string;
};

// 支持的 AI 提供商模板
const PROVIDER_TEMPLATES: Record<string, {
  name: string;
  type: string;
  baseUrl: string;
  models: string[];
}> = {
  openai: {
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    name: 'Claude (Anthropic)',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  },
  minimax: {
    name: 'MiniMax (海螺AI)',
    type: 'minimax',
    baseUrl: 'https://api.minimax.chat/v1',
    models: ['MiniMax-Text-01', 'abab6.5s-chat'],
  },
  zhipu: {
    name: '智谱 GLM',
    type: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4', 'glm-3-turbo'],
  },
  kimi: {
    name: 'Kimi (月之暗面)',
    type: 'kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  qwen: {
    name: '通义千问 (阿里)',
    type: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'],
  },
  doubao: {
    name: '豆包 (字节)',
    type: 'doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro-32k', 'doubao-lite-32k'],
  },
  deepseek: {
    name: 'DeepSeek',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
  },
  spark: {
    name: '讯飞星火',
    type: 'spark',
    baseUrl: 'https://spark-api.xf-yun.com/v3.5/chat',
    models: ['Spark4.0 Ultra', 'Spark3.5 Pro', 'Spark3.5 Standard'],
  },
  yi: {
    name: '零一万物 Yi',
    type: 'yi',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    models: ['yi-medium', 'yi-large', 'yi-large-rag'],
  },
  ollama: {
    name: 'Ollama (本地)',
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    models: ['llama3', 'mistral', 'codellama', 'qwen2'],
  },
  siliconflow: {
    name: 'SiliconFlow (聚合)',
    type: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V2.5', 'Anthropic/claude-3.5-sonnet'],
  },
};

export default function Settings() {
  const [settings, setSettings] = useState({
    theme: 'dark',
    autoStart: true,
    notifications: true,
    autoPublish: false,
    maxConcurrentTasks: 3,
    browserHeadless: false,
  });

  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const list = await window.electronAPI?.getAIProviders();
      setProviders(list || []);
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  };

  const handleAddProvider = async () => {
    if (!selectedProvider || !apiKey.trim()) {
      setMessage({ type: 'error', text: '请选择提供商并输入 API Key' });
      return;
    }

    const template = PROVIDER_TEMPLATES[selectedProvider as keyof typeof PROVIDER_TEMPLATES];
    if (!template) {
      setMessage({ type: 'error', text: '未知的提供商' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const result = await window.electronAPI?.addAIProvider({
        name: template.name,
        type: template.type,
        apiKey: apiKey.trim(),
        baseUrl: template.baseUrl,
        models: template.models,
        isDefault: providers.length === 0,
      });

      if (result?.success) {
        setMessage({ type: 'success', text: `${template.name} 配置成功` });
        setApiKey('');
        loadProviders();
      } else {
        setMessage({ type: 'error', text: result?.error || '配置失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      {/* 外观 */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>外观</h3>

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>主题</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              选择应用的外观模式
            </div>
          </div>
          <select
            className="input"
            style={{ width: 120 }}
            value={settings.theme}
            onChange={e => setSettings({ ...settings, theme: e.target.value })}
          >
            <option value="dark">深色</option>
            <option value="light">浅色</option>
            <option value="system">跟随系统</option>
          </select>
        </div>
      </div>

      {/* 运行设置 */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>运行设置</h3>

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>开机自启</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              登录时自动启动应用
            </div>
          </div>
          <Toggle
            checked={settings.autoStart}
            onChange={v => setSettings({ ...settings, autoStart: v })}
          />
        </div>

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>浏览器无头模式</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              隐藏浏览器窗口（仅影响新任务）
            </div>
          </div>
          <Toggle
            checked={settings.browserHeadless}
            onChange={v => setSettings({ ...settings, browserHeadless: v })}
          />
        </div>

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>最大并发任务数</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              同时执行的任务数量
            </div>
          </div>
          <select
            className="input"
            style={{ width: 80 }}
            value={settings.maxConcurrentTasks}
            onChange={e => setSettings({ ...settings, maxConcurrentTasks: Number(e.target.value) })}
          >
            {[1, 2, 3, 5].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 通知设置 */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>通知</h3>

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>推送通知</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              任务完成或失败时通知
            </div>
          </div>
          <Toggle
            checked={settings.notifications}
            onChange={v => setSettings({ ...settings, notifications: v })}
          />
        </div>

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>自动发布</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              定时任务到达时自动执行，无需确认
            </div>
          </div>
          <Toggle
            checked={settings.autoPublish}
            onChange={v => setSettings({ ...settings, autoPublish: v })}
          />
        </div>
      </div>

      {/* AI 设置 */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>AI 设置</h3>

        {/* 已配置的提供商 */}
        {providers.length > 0 && (
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <div style={{ fontWeight: 500, marginBottom: 'var(--space-sm)' }}>已配置的提供商</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {providers.map(p => (
                <div key={p.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-sm) var(--space-md)',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span style={{ marginLeft: 'var(--space-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.models[0]}
                    </span>
                    {p.isDefault && (
                      <span style={{
                        marginLeft: 'var(--space-sm)',
                        fontSize: 10,
                        padding: '2px 6px',
                        background: 'var(--primary)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'white',
                      }}>
                        默认
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 12,
                    color: p.status === 'active' ? 'var(--success)' : 'var(--text-muted)'
                  }}>
                    {p.status === 'active' ? '✓ 已连接' : '未配置'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 添加新提供商 */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-lg)' }}>
          <div style={{ fontWeight: 500, marginBottom: 'var(--space-md)' }}>添加 AI 提供商</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={settingRow}>
              <div>
                <div style={{ fontWeight: 500 }}>选择提供商</div>
              </div>
              <select
                className="input"
                style={{ width: 180 }}
                value={selectedProvider}
                onChange={e => setSelectedProvider(e.target.value)}
              >
                <option value="">请选择...</option>
                {Object.entries(PROVIDER_TEMPLATES).map(([key, t]) => (
                  <option key={key} value={key}>{t.name}</option>
                ))}
              </select>
            </div>

            {selectedProvider && (
              <>
                <div style={settingRow}>
                  <div>
                    <div style={{ fontWeight: 500 }}>API Key</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {PROVIDER_TEMPLATES[selectedProvider as keyof typeof PROVIDER_TEMPLATES]?.baseUrl}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      className="input"
                      style={{ width: 250 }}
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ padding: 'var(--space-xs) var(--space-sm)' }}
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? '隐藏' : '显示'}
                    </button>
                  </div>
                </div>

                {message && (
                  <div style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    borderRadius: 'var(--radius-md)',
                    background: message.type === 'error' ? 'var(--error-muted)' : 'var(--success-muted)',
                    color: message.type === 'error' ? 'var(--error)' : 'var(--success)',
                    fontSize: 13,
                  }}>
                    {message.text}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                  <button
                    className="btn btn-primary"
                    disabled={saving || !apiKey.trim()}
                    onClick={handleAddProvider}
                  >
                    {saving ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>数据管理</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
            📥 导出数据
          </button>
          <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
            📤 导入数据
          </button>
          <button
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start', color: 'var(--error)' }}
          >
            🗑️ 清除所有数据
          </button>
        </div>
      </div>

      {/* 关于 */}
      <div className="card">
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>关于</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <p>MatrixHub v0.1.0</p>
          <p style={{ marginTop: 'var(--space-xs)' }}>
            多平台内容创作与发布管理工具
          </p>
        </div>
      </div>
    </div>
  );
}

const settingRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-md) 0',
  borderBottom: '1px solid var(--border-subtle)',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--primary)' : 'var(--border-default)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 150ms ease',
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 'var(--radius-full)',
          background: 'white',
          position: 'absolute',
          top: 3,
          left: checked ? 23 : 3,
          transition: 'left 150ms ease',
        }}
      />
    </div>
  );
}
