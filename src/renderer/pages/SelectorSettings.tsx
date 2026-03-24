import { useState, useEffect } from 'react';
import type { Platform } from '~shared/types';

type Selector = {
  selectorKey: string;
  value: string;
  type: string;
  version: number;
  successRate: number;
  failureCount: number;
  updatedAt: number;
};

type SelectorVersion = {
  version: number;
  value: string;
  successRate: number;
  failureCount: number;
  updatedAt: number;
};

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'douyin', label: '抖音' },
  { key: 'kuaishou', label: '快手' },
  { key: 'xiaohongshu', label: '小红书' },
];

const SELECTOR_KEYS = [
  { key: 'title_input', label: '标题输入框' },
  { key: 'content_input', label: '内容输入框' },
  { key: 'video_input', label: '视频上传' },
  { key: 'image_input', label: '图片上传' },
  { key: 'publish_confirm', label: '发布按钮' },
  { key: 'login_state', label: '登录状态' },
  { key: 'comment_input', label: '评论输入框' },
  { key: 'like_button', label: '点赞按钮' },
  { key: 'follow_button', label: '关注按钮' },
];

// 默认选择器模板
const DEFAULT_SELECTORS: Record<Platform, Record<string, string>> = {
  douyin: {
    title_input: '[data-e2e="title-input"]',
    content_input: '[data-e2e="content-input"]',
    video_input: 'input[type="file"]',
    publish_confirm: '[data-e2e="publish-btn"]',
    login_state: '[data-e2e="user-info"]',
    comment_input: '[data-e2e="comment-input"]',
    like_button: '[data-e2e="like-icon"]',
    follow_button: '[data-e2e="follow"]',
  },
  kuaishou: {
    title_input: '[name="title"]',
    content_input: 'textarea[name="content"]',
    video_input: 'input[type="file"]',
    publish_confirm: 'button:has-text("发布")',
    login_state: '[class*="user-info"]',
    comment_input: 'textarea',
    like_button: '[class*="like-btn"]',
    follow_button: 'button:has-text("关注")',
  },
  xiaohongshu: {
    title_input: '[class*="title"] input',
    content_input: '[class*="editor"] textarea',
    video_input: 'input[type="file"]',
    publish_confirm: 'button:has-text("发布")',
    login_state: '[class*="avatar"]',
    comment_input: 'textarea',
    like_button: '[class*="like"]',
    follow_button: 'button:has-text("关注")',
  },
};

export default function SelectorSettings() {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [selectors, setSelectors] = useState<Selector[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [versions, setVersions] = useState<SelectorVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSelectors();
  }, [platform]);

  const loadSelectors = async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI?.listSelectors(platform);
      setSelectors(list || []);
    } catch (error) {
      console.error('Failed to load selectors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (selector: Selector) => {
    setEditingKey(selector.selectorKey);
    setEditValue(selector.value);
    setVersions([]);
  };

  const handleViewVersions = async (selectorKey: string) => {
    const vers = await window.electronAPI?.getSelectorVersions(platform, selectorKey);
    setVersions(vers || []);
  };

  const handleSave = async () => {
    if (!editingKey) return;

    setLoading(true);
    setMessage(null);

    try {
      await window.electronAPI?.registerSelector({
        platform,
        selectorKey: editingKey,
        value: editValue,
        type: editValue.startsWith('//') ? 'xpath' : 'css',
      });
      setMessage({ type: 'success', text: '选择器已更新' });
      setEditingKey(null);
      setEditValue('');
      loadSelectors();
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (selectorKey: string) => {
    const defaultValue = DEFAULT_SELECTORS[platform]?.[selectorKey];
    if (!defaultValue) return;

    setLoading(true);
    setMessage(null);

    try {
      await window.electronAPI?.registerSelector({
        platform,
        selectorKey,
        value: defaultValue,
        type: defaultValue.startsWith('//') ? 'xpath' : 'css',
      });
      setMessage({ type: 'success', text: '已重置为默认值' });
      loadSelectors();
    } catch (error) {
      setMessage({ type: 'error', text: '重置失败' });
    } finally {
      setLoading(false);
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 0.8) return 'var(--success)';
    if (rate >= 0.5) return 'var(--warning)';
    return 'var(--error)';
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 'var(--space-md)' }}>
          平台选择器设置
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          选择器用于定位网页元素。当平台 UI 变化导致自动化失败时，可在此更新选择器。
        </p>
      </div>

      {/* 平台切换 */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
        {PLATFORMS.map(p => (
          <button
            key={p.key}
            className={`btn ${platform === p.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPlatform(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {message && (
        <div style={{
          padding: 'var(--space-sm) var(--space-md)',
          borderRadius: 'var(--radius-md)',
          background: message.type === 'error' ? 'var(--error-muted)' : 'var(--success-muted)',
          color: message.type === 'error' ? 'var(--error)' : 'var(--success)',
          fontSize: 13,
          marginBottom: 'var(--space-md)',
        }}>
          {message.text}
        </div>
      )}

      {/* 选择器列表 */}
      <div className="card">
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>
          {PLATFORMS.find(p => p.key === platform)?.label} 选择器
        </h3>

        {loading && selectors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
            加载中...
          </div>
        ) : selectors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
            暂无选择器数据
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {SELECTOR_KEYS.map(({ key, label }) => {
              const selector = selectors.find(s => s.selectorKey === key);
              const isEditing = editingKey === key;

              return (
                <div
                  key={key}
                  style={{
                    padding: 'var(--space-md)',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-md)',
                    border: isEditing ? '1px solid var(--primary)' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{label}</span>
                      <span style={{ marginLeft: 'var(--space-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
                        ({key})
                      </span>
                    </div>
                    {selector && (
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                        <span style={{
                          fontSize: 11,
                          color: getSuccessRateColor(selector.successRate),
                        }}>
                          成功率: {(selector.successRate * 100).toFixed(0)}%
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          失败: {selector.failureCount}
                        </span>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                      <input
                        type="text"
                        className="input"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                        placeholder="输入 CSS 选择器或 XPath"
                      />
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading}>
                          保存
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingKey(null)}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : selector ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <code style={{
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-base)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        {selector.value}
                      </code>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleViewVersions(key)}
                        >
                          历史
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleEdit(selector)}
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleReset(key)}
                          disabled={!DEFAULT_SELECTORS[platform]?.[key]}
                        >
                          重置
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {DEFAULT_SELECTORS[platform]?.[key]
                          ? `默认值: ${DEFAULT_SELECTORS[platform][key]}`
                          : '未设置'}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingKey(key);
                          setEditValue(DEFAULT_SELECTORS[platform]?.[key] || '');
                        }}
                      >
                        添加
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 历史版本 */}
      {versions.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
          <h4 style={{ marginBottom: 'var(--space-md)' }}>版本历史</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {versions.map((v, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-sm)',
                  background: i === 0 ? 'var(--bg-elevated)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <span style={{ fontWeight: i === 0 ? 500 : 400 }}>
                    v{v.version} {i === 0 && '(当前)'}
                  </span>
                  <code style={{
                    marginLeft: 'var(--space-sm)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}>
                    {v.value}
                  </code>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  成功率: {(v.successRate * 100).toFixed(0)}% | 失败: {v.failureCount}
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 'var(--space-md)' }}
            onClick={() => setVersions([])}
          >
            关闭
          </button>
        </div>
      )}

      {/* 帮助说明 */}
      <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
        <h4 style={{ marginBottom: 'var(--space-md)' }}>如何获取选择器？</h4>
        <ol style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 'var(--space-lg)', lineHeight: 1.8 }}>
          <li>打开 {PLATFORMS.find(p => p.key === platform)?.label} 的创作者后台</li>
          <li>按 F12 打开开发者工具</li>
          <li>点击左上角的箭头图标（选择元素）</li>
          <li>点击要定位的元素（如发布按钮）</li>
          <li>在 Elements 面板中右键复制选择器</li>
          <li>粘贴到此处并保存</li>
        </ol>
        <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
          <strong style={{ fontSize: 12 }}>提示：</strong>
          <ul style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 'var(--space-xs)', paddingLeft: 'var(--space-md)' }}>
            <li>CSS 选择器：如 <code>#id</code>, <code>.class</code>, <code>[data-e2e="xxx"]</code></li>
            <li>XPath：如 <code>//button[text()="发布"]</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
