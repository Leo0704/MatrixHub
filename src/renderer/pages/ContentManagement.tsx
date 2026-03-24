import { useState, useEffect } from 'react';
import type { Task, Platform } from '~shared/types';

export default function ContentManagement() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'running' | 'completed' | 'failed'>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | Platform>('all');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadTasks();

    window.electronAPI?.onTaskCreated((task) => {
      setTasks(prev => [task, ...prev]);
    });

    window.electronAPI?.onTaskUpdated((task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    });

    return () => {
      window.electronAPI?.removeAllListeners('task:created');
      window.electronAPI?.removeAllListeners('task:updated');
    };
  }, []);

  const loadTasks = async () => {
    try {
      const result = await window.electronAPI?.listTasks({ type: 'publish' });
      setTasks(result ?? []);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    await window.electronAPI?.cancelTask(taskId);
  };

  const handleRetry = async (taskId: string) => {
    await window.electronAPI?.retryTask(taskId);
  };

  const filteredTasks = tasks.filter(task => {
    if (filter !== 'all' && task.status !== filter) return false;
    if (selectedPlatform !== 'all' && task.platform !== selectedPlatform) return false;
    return true;
  });

  if (loading) {
    return <div className="empty-state"><div className="empty-state-icon">⏳</div><p>加载中...</p></div>;
  }

  return (
    <div>
      {/* 操作栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-xl)'
      }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <select
            className="input"
            style={{ width: 120 }}
            value={selectedPlatform}
            onChange={e => setSelectedPlatform(e.target.value as any)}
          >
            <option value="all">全部平台</option>
            <option value="douyin">抖音</option>
            <option value="kuaishou">快手</option>
            <option value="xiaohongshu">小红书</option>
          </select>

          <select
            className="input"
            style={{ width: 120 }}
            value={filter}
            onChange={e => setFilter(e.target.value as any)}
          >
            <option value="all">全部状态</option>
            <option value="pending">等待中</option>
            <option value="running">执行中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + 新建内容
        </button>
      </div>

      {/* 内容列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <h3>暂无内容</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              创建你的第一个内容任务吧
            </p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-lg)' }}
              onClick={() => setShowCreateModal(true)}
            >
              创建内容
            </button>
          </div>
        ) : (
          filteredTasks.map(task => (
            <ContentCard
              key={task.id}
              task={task}
              onCancel={() => handleCancel(task.id)}
              onRetry={() => handleRetry(task.id)}
            />
          ))
        )}
      </div>

      {/* 创建弹窗 */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(task) => {
            setTasks([task, ...tasks]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

function ContentCard({
  task,
  onCancel,
  onRetry,
}: {
  task: Task;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const result = task.result as { views?: number; likes?: number; comments?: number } | undefined;
  const platformName = task.platform === 'douyin' ? '抖音' :
                      task.platform === 'kuaishou' ? '快手' : '小红书';

  return (
    <div className="card" style={{
      display: 'flex',
      gap: 'var(--space-lg)',
      alignItems: 'flex-start'
    }}>
      {/* 缩略图占位 */}
      <div style={{
        width: 120,
        height: 80,
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {task.platform === 'douyin' ? '🎵' :
         task.platform === 'kuaishou' ? '📱' : '📕'}
      </div>

      {/* 内容信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xs)'
        }}>
          <span className={`badge badge-platform-${task.platform}`}>
            {platformName}
          </span>
          <StatusBadge status={task.status} />
        </div>

        <h3 style={{
          fontSize: 16,
          fontWeight: 500,
          marginBottom: 'var(--space-sm)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {task.title}
        </h3>

        <div style={{
          display: 'flex',
          gap: 'var(--space-lg)',
          fontSize: 13,
          color: 'var(--text-secondary)'
        }}>
          <span>创建于 {formatTime(task.createdAt)}</span>
          {task.scheduledAt && (
            <span>计划发布 {formatTime(task.scheduledAt)}</span>
          )}
        </div>

        {/* 数据统计 */}
        {task.status === 'completed' && result && (
          <div style={{
            display: 'flex',
            gap: 'var(--space-xl)',
            marginTop: 'var(--space-md)',
            paddingTop: 'var(--space-md)',
            borderTop: '1px solid var(--border-subtle)'
          }}>
            <Stat label="观看" value={formatNumber(result.views ?? 0)} />
            <Stat label="点赞" value={formatNumber(result.likes ?? 0)} />
            <Stat label="评论" value={formatNumber(result.comments ?? 0)} />
          </div>
        )}

        {/* 错误信息 */}
        {task.status === 'failed' && task.error && (
          <div style={{
            marginTop: 'var(--space-md)',
            padding: 'var(--space-sm)',
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--error)',
          }}>
            错误: {task.error}
          </div>
        )}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        {(task.status === 'pending' || task.status === 'running' || task.status === 'deferred') && (
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onCancel}>
            取消
          </button>
        )}
        {task.status === 'failed' && (
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onRetry}>
            重试
          </button>
        )}
        <button className="btn btn-ghost" style={{ fontSize: 13 }}>
          详情
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Task['status'] }) {
  const config = {
    pending: { label: '等待中', color: 'var(--text-muted)' },
    running: { label: '执行中', color: 'var(--primary)' },
    completed: { label: '已完成', color: 'var(--success)' },
    failed: { label: '失败', color: 'var(--error)' },
    cancelled: { label: '已取消', color: 'var(--text-muted)' },
    deferred: { label: '延迟', color: 'var(--warning)' },
  };

  const c = config[status];

  return (
    <span style={{
      fontSize: 11,
      padding: '2px 6px',
      borderRadius: 'var(--radius-sm)',
      background: `${c.color}15`,
      color: c.color,
      fontWeight: 500,
    }}>
      {c.label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function CreateTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setCreating(true);
    try {
      const task = await window.electronAPI?.createTask({
        type: 'publish',
        platform,
        title: title.trim(),
        payload: {
          title: title.trim(),
          content: content.trim(),
        },
      });
      if (task) {
        onCreated(task);
      }
    } catch (error) {
      console.error('创建任务失败:', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="card" style={{ width: 500, maxWidth: '90vw' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>新建内容</h3>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>平台</label>
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

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>标题</label>
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder="输入内容标题"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>内容</label>
          <textarea
            className="input"
            style={{
              width: '100%',
              height: 120,
              padding: 'var(--space-md)',
              resize: 'none',
            }}
            placeholder="输入正文内容"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !title.trim()}
          >
            {creating ? '创建中...' : '创建'}
          </button>
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
  marginBottom: 'var(--space-sm)',
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}
