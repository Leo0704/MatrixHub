import { useState } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState({
    theme: 'dark',
    autoStart: true,
    notifications: true,
    autoPublish: false,
    maxConcurrentTasks: 3,
    browserHeadless: false,
  });

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

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>默认 AI 提供商</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              用于内容生成的 AI 模型
            </div>
          </div>
          <select className="input" style={{ width: 150 }}>
            <option>GPT-4o (OpenAI)</option>
            <option>Claude 3.5 (Anthropic)</option>
            <option>GLM-4 (Zhipu)</option>
          </select>
        </div>

        <div style={settingRow}>
          <div>
            <div style={{ fontWeight: 500 }}>AI 生成温度</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              控制随机性（0-1，越高越有创意）
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            defaultValue="0.7"
            style={{ width: 100 }}
          />
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
          <p>AI矩阵运营大师 v0.1.0</p>
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
