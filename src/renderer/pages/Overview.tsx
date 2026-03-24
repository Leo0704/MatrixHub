import { useState, useEffect } from 'react';
import type { Task } from '~shared/types';

export default function Overview() {
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    deferred: number;
  } | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    // 监听任务更新
    window.electronAPI?.onTaskCreated((task) => {
      setRecentTasks(prev => [task, ...prev.slice(0, 9)]);
    });

    window.electronAPI?.onTaskUpdated((task) => {
      setRecentTasks(prev => prev.map(t => t.id === task.id ? task : t));
      loadStats(); // 刷新统计
    });

    return () => {
      window.electronAPI?.removeAllListeners('task:created');
      window.electronAPI?.removeAllListeners('task:updated');
    };
  }, []);

  const loadData = async () => {
    try {
      const [taskStats, tasks] = await Promise.all([
        window.electronAPI?.getTaskStats(),
        window.electronAPI?.listTasks({ limit: 5 }),
      ]);
      setStats(taskStats);
      setRecentTasks(tasks ?? []);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const taskStats = await window.electronAPI?.getTaskStats();
    setStats(taskStats);
  };

  if (loading) {
    return <div className="empty-state"><div className="empty-state-icon">⏳</div><p>加载中...</p></div>;
  }

  const totalTasks = stats?.total ?? 0;
  const totalCompleted = stats?.completed ?? 0;
  const totalFailed = stats?.failed ?? 0;
  const totalPending = (stats?.pending ?? 0) + (stats?.running ?? 0) + (stats?.deferred ?? 0);
  const successRate = totalCompleted + totalFailed > 0
    ? ((totalCompleted / (totalCompleted + totalFailed)) * 100).toFixed(1)
    : '0';

  return (
    <div>
      {/* 统计卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        <StatCard label="总任务数" value={totalTasks} icon="📋" color="var(--primary)" />
        <StatCard label="执行中" value={totalPending} icon="⚡" color="var(--accent-orange)" />
        <StatCard label="已完成" value={totalCompleted} icon="✅" color="var(--success)" />
        <StatCard label="成功率" value={`${successRate}%`} icon="📊" color="var(--info)" />
      </div>

      {/* 最近任务 */}
      <div className="card">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-lg)'
        }}>
          <h3>最近任务</h3>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
            onClick={() => {/* 导航到内容管理 */}}
          >
            查看全部 →
          </button>
        </div>

        {recentTasks.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
            <div className="empty-state-icon">📝</div>
            <p style={{ color: 'var(--text-muted)' }}>暂无任务，创建一个开始吧</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {recentTasks.map(task => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}) {
  return (
    <div className="card" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)'
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 'var(--radius-lg)',
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)'
        }}>
          {value}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const statusConfig = {
    pending: { label: '等待中', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
    running: { label: '执行中', color: 'var(--primary)', bg: 'rgba(59,130,246,0.1)' },
    completed: { label: '已完成', color: 'var(--success)', bg: 'rgba(34,197,94,0.1)' },
    failed: { label: '失败', color: 'var(--error)', bg: 'rgba(239,68,68,0.1)' },
    cancelled: { label: '已取消', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
    deferred: { label: '延迟', color: 'var(--warning)', bg: 'rgba(234,179,8,0.1)' },
  };

  const status = statusConfig[task.status];
  const platformName = task.platform === 'douyin' ? '抖音' :
                        task.platform === 'kuaishou' ? '快手' : '小红书';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      padding: 'var(--space-md)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)',
    }}>
      <span className={`badge badge-platform-${task.platform}`}>
        {platformName}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {task.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {formatTime(task.createdAt)}
        </div>
      </div>

      {task.status === 'running' && task.progress !== undefined && (
        <div style={{
          width: 60,
          height: 4,
          borderRadius: 2,
          background: 'var(--border-subtle)',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${task.progress}%`,
            height: '100%',
            background: 'var(--primary)',
            transition: 'width 300ms ease'
          }} />
        </div>
      )}

      <span style={{
        fontSize: 12,
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        background: status.bg,
        color: status.color,
        fontWeight: 500,
      }}>
        {status.label}
      </span>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}
