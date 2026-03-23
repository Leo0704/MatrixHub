import { useState } from 'react';
import type { PlatformStats, Task } from '../types';

const mockStats: PlatformStats[] = [
  { platform: 'douyin', totalTasks: 156, completedTasks: 142, failedTasks: 8, pendingTasks: 6, successRate: 94.7 },
  { platform: 'kuaishou', totalTasks: 89, completedTasks: 85, failedTasks: 2, pendingTasks: 2, successRate: 97.7 },
  { platform: 'xiaohongshu', totalTasks: 67, completedTasks: 62, failedTasks: 3, pendingTasks: 2, successRate: 94.0 },
];

const mockRecentTasks: Task[] = [
  {
    id: '1',
    type: 'publish',
    platform: 'douyin',
    status: 'completed',
    title: '【干货】5个技巧让你的视频爆款',
    payload: {},
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now() - 3600000,
  },
  {
    id: '2',
    type: 'ai_generate',
    platform: 'xiaohongshu',
    status: 'running',
    title: '春日穿搭灵感文案生成',
    payload: {},
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now() - 1800000,
    progress: 65,
  },
  {
    id: '3',
    type: 'publish',
    platform: 'kuaishou',
    status: 'pending',
    title: '美食探店系列第三期',
    payload: {},
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: Date.now() + 7200000,
    createdAt: Date.now(),
  },
];

export default function Overview() {
  const totalTasks = mockStats.reduce((sum, s) => sum + s.totalTasks, 0);
  const totalCompleted = mockStats.reduce((sum, s) => sum + s.completedTasks, 0);
  const totalFailed = mockStats.reduce((sum, s) => sum + s.failedTasks, 0);

  return (
    <div>
      {/* 统计卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        <StatCard
          label="总任务数"
          value={totalTasks}
          icon="📋"
          color="var(--primary)"
        />
        <StatCard
          label="已完成"
          value={totalCompleted}
          icon="✅"
          color="var(--success)"
        />
        <StatCard
          label="失败"
          value={totalFailed}
          icon="❌"
          color="var(--error)"
        />
        <StatCard
          label="平均成功率"
          value={`${((totalCompleted / (totalCompleted + totalFailed || 1)) * 100).toFixed(1)}%`}
          icon="📊"
          color="var(--accent-orange)"
        />
      </div>

      {/* 平台统计 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        {mockStats.map(stat => (
          <PlatformCard key={stat.platform} stats={stat} />
        ))}
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
          <button className="btn btn-ghost" style={{ fontSize: 13 }}>
            查看全部 →
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {mockRecentTasks.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
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

function PlatformCard({ stats }: { stats: PlatformStats }) {
  const platformInfo = {
    douyin: { name: '抖音', icon: '🎵', color: 'var(--platform-douyin)' },
    kuaishou: { name: '快手', icon: '📱', color: 'var(--platform-kuaishou)' },
    xiaohongshu: { name: '小红书', icon: '📕', color: 'var(--platform-xiaohongshu)' },
  };

  const info = platformInfo[stats.platform];

  return (
    <div className="card">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-lg)'
      }}>
        <span style={{ fontSize: 20 }}>{info.icon}</span>
        <span style={{ fontWeight: 600 }}>{info.name}</span>
        <span
          className={`badge badge-platform-${stats.platform}`}
          style={{ marginLeft: 'auto' }}
        >
          {info.name}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {stats.totalTasks}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>总任务</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
            {stats.successRate}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>成功率</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {stats.pendingTasks}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>等待中</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--error)' }}>
            {stats.failedTasks}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>失败</div>
        </div>
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
        {task.platform === 'douyin' ? '抖音' : task.platform === 'kuaishou' ? '快手' : '小红书'}
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
          {new Date(task.createdAt).toLocaleString('zh-CN')}
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
