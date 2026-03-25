import { useState, useEffect } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { ConfirmModal } from '../components/ConfirmModal';

export default function Settings() {
  const [version, setVersion] = useState('v0.1.0');
  const [exportStatus, setExportStatus] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    window.electronAPI?.getVersion().then(setVersion).catch((err) => console.error('Failed to load version:', err));
  }, []);

  const handleExport = async () => {
    try {
      const data = await window.electronAPI?.exportData();
      if (!data) {
        setExportStatus('导出失败：无法获取数据');
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `matrixhub-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus('导出成功！');
    } catch (err) {
      console.error('Export failed:', err);
      setExportStatus('导出失败');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const result = await window.electronAPI?.importData(data);
        if (result?.success) {
          setExportStatus('导入成功！请刷新页面。');
        } else {
          setExportStatus('导入失败: ' + (result?.error || '未知错误'));
        }
      } catch (err) {
        console.error('Import failed:', err);
        setExportStatus('导入失败');
      }
    };
    input.click();
  };

  const [settings, setSettings] = useState({
    theme: 'dark',
    autoStart: true,
    notifications: true,
    autoPublish: false,
    maxConcurrentTasks: 3,
    browserHeadless: false,
  });

  // 任务类型绑定状态
  type TaskType = 'text' | 'image' | 'video' | 'voice';
  const TASK_TYPES: { type: TaskType; label: string; desc: string }[] = [
    { type: 'text', label: '文案生成', desc: '用于生成短视频脚本、种草文案等' },
    { type: 'image', label: '图片生成', desc: '用于 AI 生成配图、海报等' },
    { type: 'video', label: '视频生成', desc: '用于 AI 生成视频内容' },
    { type: 'voice', label: '配音', desc: '用于文字转语音、配音合成' },
  ];

  // 每个任务类型的 AI 配置（apiKey 只在保存时填写，不从服务端加载）
  const [taskAIConfigs, setTaskAIConfigs] = useState<Record<TaskType, { baseUrl: string; hasApiKey: boolean; model: string; apiKey: string }>>({
    text: { baseUrl: '', hasApiKey: false, model: '', apiKey: '' },
    image: { baseUrl: '', hasApiKey: false, model: '', apiKey: '' },
    video: { baseUrl: '', hasApiKey: false, model: '', apiKey: '' },
    voice: { baseUrl: '', hasApiKey: false, model: '', apiKey: '' },
  });
  const [testingTask, setTestingTask] = useState<TaskType | null>(null);
  const [savingTask, setSavingTask] = useState<TaskType | null>(null);
  const [taskMsg, setTaskMsg] = useState<Record<TaskType, { type: 'success' | 'error'; text: string } | null>>({
    text: null,
    image: null,
    video: null,
    voice: null,
  });
  const [expandedTask, setExpandedTask] = useState<TaskType | null>('text');

  useEffect(() => {
    loadTaskBindings();
  }, []);

  const loadTaskBindings = async () => {
    try {
      const configs = await window.electronAPI?.getTaskAIConfigs();
      if (configs) {
        setTaskAIConfigs({
          text: { ...{ baseUrl: '', hasApiKey: false, model: '', apiKey: '' }, ...configs.text, apiKey: '' },
          image: { ...{ baseUrl: '', hasApiKey: false, model: '', apiKey: '' }, ...configs.image, apiKey: '' },
          video: { ...{ baseUrl: '', hasApiKey: false, model: '', apiKey: '' }, ...configs.video, apiKey: '' },
          voice: { ...{ baseUrl: '', hasApiKey: false, model: '', apiKey: '' }, ...configs.voice, apiKey: '' },
        });
      }
    } catch (error) {
      console.error('Failed to load task AI configs:', error);
    }
  };

  const handleTestTaskAI = async (taskType: TaskType) => {
    const config = taskAIConfigs[taskType];
    // 需要用户输入新的 API Key 才能测试（安全设计：不回传已存储的 key）
    if (!config.baseUrl || !config.apiKey || !config.model) {
      setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'error', text: '请填写完整信息（包括 API Key）' } }));
      return;
    }
    setTestingTask(taskType);
    setTaskMsg(prev => ({ ...prev, [taskType]: null }));
    try {
      const result = await window.electronAPI?.testAIConnection({
        baseUrl: config.baseUrl.trim().replace(/\/$/, ''),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
      });
      if (result?.success) {
        setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'success', text: '连接成功！' } }));
      } else {
        setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'error', text: result?.error || '连接失败' } }));
      }
    } catch (error) {
      setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'error', text: '连接失败' } }));
    } finally {
      setTestingTask(null);
    }
  };

  const handleSaveTaskAI = async (taskType: TaskType) => {
    const config = taskAIConfigs[taskType];
    // 允许保存：baseUrl + model 必须填写，且必须有 API Key（已有或新输入）
    if (!config.baseUrl || !config.model || (!config.apiKey && !config.hasApiKey)) {
      setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'error', text: '请填写完整信息' } }));
      return;
    }
    setSavingTask(taskType);
    setTaskMsg(prev => ({ ...prev, [taskType]: null }));
    try {
      const result = await window.electronAPI?.saveTaskAIConfig(taskType, {
        baseUrl: config.baseUrl.trim().replace(/\/$/, ''),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
      });
      if (result?.success) {
        setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'success', text: '保存成功！' } }));
      } else {
        setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'error', text: result?.error || '保存失败' } }));
      }
    } catch (error) {
      setTaskMsg(prev => ({ ...prev, [taskType]: { type: 'error', text: '保存失败' } }));
    } finally {
      setSavingTask(null);
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
          <ThemeToggle />
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

      {/* 任务类型 AI 配置 */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-sm)' }}>AI 配置</h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
          为每个任务类型配置 AI（Base URL + API Key + 模型）
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {TASK_TYPES.map(({ type, label, desc }) => (
            <div key={type} style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}>
              {/* Header - 可点击展开/收起 */}
              <div
                role="button"
                aria-expanded={expandedTask === type}
                aria-controls={`task-config-${type}`}
                tabIndex={0}
                onClick={() => setExpandedTask(expandedTask === type ? null : type)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedTask(expandedTask === type ? null : type);
                  }
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-md)',
                  background: expandedTask === type ? 'var(--bg-elevated)' : 'transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  {taskAIConfigs[type].baseUrl && (
                    <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ 已配置</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {expandedTask === type ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* 展开的内容 */}
              {expandedTask === type && (
                <div id={`task-config-${type}`} style={{
                  padding: 'var(--space-md)',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 'var(--space-xs)' }}>Base URL</div>
                      <input
                        className="input"
                        placeholder="https://api.deepseek.com/v1"
                        value={taskAIConfigs[type].baseUrl}
                        onChange={e => setTaskAIConfigs({
                          ...taskAIConfigs,
                          [type]: { ...taskAIConfigs[type], baseUrl: e.target.value }
                        })}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 'var(--space-xs)' }}>API Key</div>
                      <input
                        className="input"
                        type="password"
                        placeholder={taskAIConfigs[type].hasApiKey ? '已配置（输入新值以更新）' : 'sk-...'}
                        value={taskAIConfigs[type].apiKey}
                        onChange={e => setTaskAIConfigs({
                          ...taskAIConfigs,
                          [type]: { ...taskAIConfigs[type], apiKey: e.target.value }
                        })}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 'var(--space-xs)' }}>模型</div>
                      <input
                        className="input"
                        placeholder="deepseek-chat"
                        value={taskAIConfigs[type].model}
                        onChange={e => setTaskAIConfigs({
                          ...taskAIConfigs,
                          [type]: { ...taskAIConfigs[type], model: e.target.value }
                        })}
                      />
                    </div>

                    {taskMsg[type] && (
                      <div style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        background: taskMsg[type]?.type === 'error' ? 'var(--error-muted)' : 'var(--success-muted)',
                        color: taskMsg[type]?.type === 'error' ? 'var(--error)' : 'var(--success)',
                        fontSize: 13,
                      }}>
                        {taskMsg[type]?.text}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                      <button
                        className="btn btn-secondary"
                        disabled={testingTask === type || !taskAIConfigs[type].baseUrl || !taskAIConfigs[type].apiKey || !taskAIConfigs[type].model}
                        onClick={() => handleTestTaskAI(type)}
                      >
                        {testingTask === type ? '测试中...' : '测试连接'}
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={savingTask === type || !taskAIConfigs[type].baseUrl || (!taskAIConfigs[type].apiKey && !taskAIConfigs[type].hasApiKey) || !taskAIConfigs[type].model}
                        onClick={() => handleSaveTaskAI(type)}
                      >
                        {savingTask === type ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 数据管理 */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>数据管理</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={handleExport}>
            📥 导出数据
          </button>
          <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={handleImport}>
            📤 导入数据
          </button>
          <button
            className="btn btn-danger"
            onClick={() => setShowClearConfirm(true)}
          >
            🗑️ 清除所有数据
          </button>
        </div>

        {exportStatus && (
          <div style={{
            marginTop: 'var(--space-md)',
            padding: 'var(--space-sm) var(--space-md)',
            borderRadius: 'var(--radius-md)',
            background: exportStatus.includes('失败') || exportStatus.includes('错误') ? 'var(--error-muted)' : 'var(--success-muted)',
            color: exportStatus.includes('失败') || exportStatus.includes('错误') ? 'var(--error)' : 'var(--success)',
            fontSize: 13,
          }}>
            {exportStatus}
          </div>
        )}
      </div>

      {/* 关于 */}
      <div className="card">
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>关于</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <p>MatrixHub {version}</p>
          <p style={{ marginTop: 'var(--space-xs)' }}>
            多平台内容创作与发布管理工具
          </p>
        </div>
      </div>
      {showClearConfirm && (
        <ConfirmModal
          title="确认清除所有数据？"
          message="此操作不可恢复。所有账号、任务和设置都将被永久删除。"
          confirmLabel="确认清除"
          onConfirm={async () => {
            await window.electronAPI?.clearAllData();
            setShowClearConfirm(false);
            setExportStatus('数据已清除！请刷新页面。');
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
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
      role="switch"
      aria-checked={checked}
      aria-label={checked ? '已启用' : '已禁用'}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
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
