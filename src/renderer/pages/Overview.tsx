import { useState, useEffect } from 'react';
import type { Task } from '~shared/types';
import { StatCard } from '../components/StatCard';
import { TaskRow } from '../components/TaskRow';

export default function Overview() {
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
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
      setStats(taskStats ?? null);
      setRecentTasks(tasks ?? []);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const taskStats = await window.electronAPI?.getTaskStats();
    setStats(taskStats ?? null);
  };

  if (loading) {
    return (
      <div>
        {/* 统计卡片骨架屏 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--space-lg)',
          marginBottom: 'var(--space-xl)'
        }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-md)'
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                animation: 'pulse 1.5s infinite'
              }} />
              <div>
                <div style={{
                  width: 60,
                  height: 22,
                  borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  animation: 'pulse 1.5s infinite',
                  marginBottom: 4
                }} />
                <div style={{
                  width: 40,
                  height: 12,
                  borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  animation: 'pulse 1.5s infinite'
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* 最近任务骨架屏 */}
        <div className="card">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-lg)'
          }}>
            <div style={{
              width: 80,
              height: 20,
              borderRadius: 4,
              background: 'var(--bg-elevated)',
              animation: 'pulse 1.5s infinite'
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{
                height: 56,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                animation: 'pulse 1.5s infinite'
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalTasks = stats?.total ?? 0;
  const totalCompleted = stats?.completed ?? 0;
  const totalFailed = stats?.failed ?? 0;
  const totalPending = (stats?.pending ?? 0) + (stats?.running ?? 0);
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
