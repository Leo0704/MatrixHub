import { useState } from 'react';
import type { Platform, Task } from '../types';

interface ScheduledTask {
  id: string;
  title: string;
  platform: Platform;
  scheduledAt: number;
  status: 'scheduled' | 'publishing' | 'published' | 'failed';
}

const mockScheduled: ScheduledTask[] = [
  { id: '1', title: '【干货】5个技巧让你的视频爆款', platform: 'douyin', scheduledAt: Date.now() + 3600000 * 2, status: 'scheduled' },
  { id: '2', title: '春日穿搭灵感｜一周不重样', platform: 'xiaohongshu', scheduledAt: Date.now() + 3600000 * 5, status: 'scheduled' },
  { id: '3', title: '美食探店系列第三期', platform: 'kuaishou', scheduledAt: Date.now() + 3600000 * 24, status: 'scheduled' },
];

export default function ScheduledPublish() {
  const [tasks, setTasks] = useState<ScheduledTask[]>(mockScheduled);

  const cancelTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const now = Date.now();

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

        {tasks.length === 0 ? (
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
                onCancel={() => cancelTask(task.id)}
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
}: {
  task: ScheduledTask;
  onCancel: () => void;
}) {
  const scheduledDate = new Date(task.scheduledAt);
  const timeUntil = task.scheduledAt - Date.now();
  const hoursUntil = Math.floor(timeUntil / 3600000);
  const minutesUntil = Math.floor((timeUntil % 3600000) / 60000);

  const platformInfo = {
    douyin: { name: '抖音', icon: '🎵' },
    kuaishou: { name: '快手', icon: '📱' },
    xiaohongshu: { name: '小红书', icon: '📕' },
  };

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
            {platformInfo[task.platform].icon}
          </span>
          <span style={{ fontWeight: 500 }}>{task.title}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {platformInfo[task.platform].name} · 定时发布
        </div>
      </div>

      {/* 状态 */}
      <span style={{
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: 'rgba(59,130,246,0.1)',
        color: 'var(--primary)',
        fontWeight: 500,
      }}>
        等待发布
      </span>

      {/* 操作 */}
      <button
        className="btn btn-ghost"
        style={{ fontSize: 12, color: 'var(--error)' }}
        onClick={onCancel}
      >
        取消
      </button>
    </div>
  );
}
