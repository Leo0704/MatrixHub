import { memo } from 'react';
import type { Task, Platform } from '~shared/types';
import { formatTime } from '../utils/formatTime';

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
}

const STATUS_CONFIG: Record<Task['status'], StatusConfig> = {
  pending: { label: '等待中', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  running: { label: '执行中', color: 'var(--primary)', bg: 'rgba(59,130,246,0.1)' },
  completed: { label: '已完成', color: 'var(--success)', bg: 'rgba(34,197,94,0.1)' },
  failed: { label: '失败', color: 'var(--error)', bg: 'rgba(239,68,68,0.1)' },
  cancelled: { label: '已取消', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  deferred: { label: '延迟', color: 'var(--warning)', bg: 'rgba(234,179,8,0.1)' },
};

const PLATFORM_NAMES: Record<Platform, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
};

interface TaskRowProps {
  task: Task;
}

export const TaskRow = memo(function TaskRow({ task }: TaskRowProps) {
  const status = STATUS_CONFIG[task.status];
  const platformName = PLATFORM_NAMES[task.platform] ?? task.platform;

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
});
