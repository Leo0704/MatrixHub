import { memo } from 'react';
import type { Task, Platform } from '~shared/types';
import { formatTime } from '../utils/formatTime';

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

const STATUS_ICONS: Record<Task['status'], React.ReactNode> = {
  pending: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  running: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  completed: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  failed: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  cancelled: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  deferred: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
};

const STATUS_CONFIG: Record<Task['status'], StatusConfig> = {
  pending: {
    label: '等待中',
    color: 'var(--text-muted)',
    bg: 'var(--bg-overlay)',
    border: 'var(--border-default)',
    icon: STATUS_ICONS.pending,
  },
  running: {
    label: '执行中',
    color: 'var(--primary)',
    bg: 'var(--primary-glow)',
    border: 'rgba(91, 141, 239, 0.3)',
    icon: STATUS_ICONS.running,
  },
  completed: {
    label: '已完成',
    color: 'var(--success)',
    bg: 'var(--success-glow)',
    border: 'rgba(52, 211, 153, 0.25)',
    icon: STATUS_ICONS.completed,
  },
  failed: {
    label: '失败',
    color: 'var(--error)',
    bg: 'var(--error-glow)',
    border: 'rgba(248, 113, 113, 0.25)',
    icon: STATUS_ICONS.failed,
  },
  cancelled: {
    label: '已取消',
    color: 'var(--text-muted)',
    bg: 'var(--bg-overlay)',
    border: 'var(--border-default)',
    icon: STATUS_ICONS.cancelled,
  },
  deferred: {
    label: '延迟',
    color: 'var(--warning)',
    bg: 'rgba(251, 191, 36, 0.1)',
    border: 'rgba(251, 191, 36, 0.25)',
    icon: STATUS_ICONS.deferred,
  },
};

const PLATFORM_NAMES: Record<Platform, string> = {
  douyin: '抖音',
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
      padding: 'var(--space-md) var(--space-lg)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      cursor: 'pointer',
      transition: 'all 200ms var(--ease-out)',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = 'var(--border-default)';
      e.currentTarget.style.background = 'var(--bg-overlay)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'var(--border-subtle)';
      e.currentTarget.style.background = 'var(--bg-elevated)';
    }}
    >
      {/* Platform Badge */}
      <span className={`badge badge-platform-${task.platform}`}>
        {platformName}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--text-primary)',
          marginBottom: 2,
        }}>
          {task.title}
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xs)',
        }}>
          <span>{formatTime(task.createdAt)}</span>
          {task.status === 'running' && task.progress !== undefined && (
            <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
              · {task.progress}%
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar (running only) */}
      {task.status === 'running' && task.progress !== undefined && (
        <div style={{
          width: 64,
          height: 4,
          borderRadius: 2,
          background: 'var(--bg-base)',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <div style={{
            width: `${task.progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--primary), var(--primary-hover))',
            borderRadius: 2,
            transition: 'width 300ms ease',
          }} />
        </div>
      )}

      {/* Status Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 500,
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: status.bg,
        color: status.color,
        border: `1px solid ${status.border}`,
        flexShrink: 0,
      }}>
        {status.icon}
        {status.label}
      </div>
    </div>
  );
});
