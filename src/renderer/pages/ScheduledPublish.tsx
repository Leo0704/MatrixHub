import { useState, useEffect, useCallback } from 'react';
import type { Task, Platform } from '~shared/types';

interface ScheduledTask {
  id: string;
  title: string;
  platform: Platform;
  scheduledAt?: number;
  status: TaskStatus;
  type: string;
  retryCount: number;
  maxRetries: number;
  error?: string;
}

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'deferred';

function mapTaskStatus(status: TaskStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'deferred':
    case 'pending':
      return { label: '等待发布', color: 'var(--primary)', bg: 'rgba(59,130,246,0.1)' };
    case 'running':
      return { label: '发布中', color: 'var(--accent-orange)', bg: 'rgba(249,115,22,0.1)' };
    case 'completed':
      return { label: '已发布', color: 'var(--success)', bg: 'rgba(34,197,94,0.1)' };
    case 'failed':
      return { label: '失败', color: 'var(--error)', bg: 'rgba(239,68,68,0.1)' };
    case 'cancelled':
      return { label: '已取消', color: 'var(--text-muted)', bg: 'rgba(156,163,175,0.1)' };
    default:
      return { label: status, color: 'var(--text-muted)', bg: 'rgba(156,163,175,0.1)' };
  }
}

export default function ScheduledPublish() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const list = await window.electronAPI?.listTasks({ status: ['deferred'] });
      setTasks(list ?? []);
      setError(null);
    } catch (err) {
      console.error('Failed to load scheduled tasks:', err);
      setError('加载定时任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();

    window.electronAPI?.onTaskUpdated((task: Task) => {
      if (task.status === 'deferred') {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === task.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...task };
            return next;
          }
          return [{ ...task, platform: task.platform as Platform } as ScheduledTask, ...prev];
        });
      } else if (task.status === 'completed') {
        setTasks(prev => prev.filter(t => t.id !== task.id));
      } else if (task.status === 'cancelled') {
        setTasks(prev => prev.filter(t => t.id !== task.id));
      } else {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === task.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...task };
            return next;
          }
          return prev;
        });
      }
    });

    return () => {
      window.electronAPI?.removeAllListeners('task:updated');
    };
  }, [loadTasks]);

  const handleCancel = async (taskId: string) => {
    try {
      await window.electronAPI?.cancelTask(taskId);
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await window.electronAPI?.retryTask(taskId);
    } catch (err) {
      console.error('Failed to retry task:', err);
    }
  };

  return (
    <div>
      {/* 快捷操作 */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-xl)'
      }}>
        <button className="btn btn-primary">
          + 创建定时任务
        </button>
        <button className="btn btn-secondary">
          批量管理
        </button>
      </div>

      {/* 日历视图占位 */}
      <div className="card" style={{
        height: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 'var(--space-xl)',
        background: 'var(--bg-elevated)'
      }}>
        <span style={{ color: 'var(--text-muted)' }}>📅 日历视图</span>
      </div>

      {/* 定时任务列表 */}
      <div className="card">
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>定时任务</h3>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 72,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                animation: 'pulse 1.5s infinite'
              }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--error)' }}>
            <p>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={loadTasks}>
              重试
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3>暂无定时任务</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              创建定时发布任务，AI 将自动执行
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {tasks.map(task => (
              <ScheduledTaskRow
                key={task.id}
                task={task}
                onCancel={() => handleCancel(task.id)}
                onRetry={() => handleRetry(task.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduledTaskRow({
  task,
  onCancel,
  onRetry,
}: {
  task: ScheduledTask;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const scheduledAt = task.scheduledAt ?? 0;
  const scheduledDate = new Date(scheduledAt);
  const timeUntil = scheduledAt - Date.now();
  const hoursUntil = Math.floor(timeUntil / 3600000);
  const minutesUntil = Math.floor((timeUntil % 3600000) / 60000);

  const platformInfo = {
    douyin: { name: '抖音', icon: '🎵' },
    kuaishou: { name: '快手', icon: '📱' },
    xiaohongshu: { name: '小红书', icon: '📕' },
  };

  const statusInfo = mapTaskStatus(task.status);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      padding: 'var(--space-md)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)',
    }}>
      {/* 时间 */}
      <div style={{
        textAlign: 'center',
        minWidth: 80,
        padding: 'var(--space-sm)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-overlay)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {hoursUntil > 0 ? `${hoursUntil}小时` : ''}{minutesUntil}分钟后
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
          {scheduledDate.getMonth() + 1}/{scheduledDate.getDate()} {scheduledDate.getHours().toString().padStart(2, '0')}:{scheduledDate.getMinutes().toString().padStart(2, '0')}
        </div>
      </div>

      {/* 内容 */}
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xs)'
        }}>
          <span style={{ fontSize: 16 }}>
            {platformInfo[task.platform]?.icon ?? '📦'}
          </span>
          <span style={{ fontWeight: 500 }}>{task.title}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {platformInfo[task.platform]?.name ?? task.platform} · 定时发布
          {task.status === 'failed' && task.error && (
            <span style={{ color: 'var(--error)', marginLeft: 8 }}>错误: {task.error}</span>
          )}
        </div>
      </div>

      {/* 状态 */}
      <span style={{
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: statusInfo.bg,
        color: statusInfo.color,
        fontWeight: 500,
      }}>
        {statusInfo.label}
      </span>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
        {task.status === 'failed' && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, color: 'var(--primary)' }}
            onClick={onRetry}
          >
            重试
          </button>
        )}
        {(task.status === 'deferred' || task.status === 'pending') && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, color: 'var(--error)' }}
            onClick={onCancel}
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}
