import { StatusBadge } from '../../../components/StatusBadge';
import type { TaskStatus } from '~shared/types';

interface ScheduledTask {
  id: string; title: string; platform: string; scheduledAt?: number;
  status: TaskStatus; type: string; retryCount: number; maxRetries: number; error?: string;
}

interface Props {
  task: ScheduledTask;
  onCancel: () => void;
  onRetry: () => void;
}

const PLATFORM_CONFIG = {
  douyin: { name: '抖音', color: 'var(--platform-douyin)' },
};

export function ScheduledTaskRow({ task, onCancel, onRetry }: Props) {
  const scheduledAt = task.scheduledAt ?? 0;
  const scheduledDate = new Date(scheduledAt);
  const timeUntil = scheduledAt - Date.now();
  const hoursUntil = Math.floor(timeUntil / 3600000);
  const minutesUntil = Math.floor((timeUntil % 3600000) / 60000);

  const platform = PLATFORM_CONFIG[task.platform as keyof typeof PLATFORM_CONFIG];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      padding: 'var(--space-md)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      transition: 'border-color 150ms ease',
    }}>
      <div style={{ textAlign: 'center', minWidth: 80, padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', background: 'var(--bg-overlay)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hoursUntil > 0 ? `${hoursUntil}小时` : ''}{minutesUntil}分钟后</div>
        <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
          {scheduledDate.getMonth() + 1}/{scheduledDate.getDate()} {scheduledDate.getHours().toString().padStart(2, '0')}:{scheduledDate.getMinutes().toString().padStart(2, '0')}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: 'var(--radius-full)',
            background: platform?.color ?? 'var(--text-muted)',
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: 500 }}>{task.title}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {platform?.name ?? task.platform} · 定时发布
          {task.status === 'failed' && task.error && <span style={{ color: 'var(--error)', marginLeft: 8 }}>错误: {task.error}</span>}
        </div>
      </div>

      <StatusBadge status={task.status} />

      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
        {task.status === 'failed' && (
          <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--primary)' }} onClick={onRetry}>重试</button>
        )}
        {(task.status === 'deferred' || task.status === 'pending') && (
          <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--error)' }} onClick={onCancel}>取消</button>
        )}
      </div>
    </div>
  );
}
