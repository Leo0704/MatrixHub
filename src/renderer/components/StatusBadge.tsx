import type { TaskStatus } from '~shared/types';

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: '等待中', color: 'var(--text-muted)' },
  running: { label: '执行中', color: 'var(--primary)' },
  completed: { label: '已完成', color: 'var(--success)' },
  failed: { label: '失败', color: 'var(--error)' },
  cancelled: { label: '已取消', color: 'var(--text-muted)' },
  deferred: { label: '延迟', color: 'var(--warning)' },
};

interface Props {
  status: TaskStatus;
}

export function StatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  return <span style={{ color: config.color }}>{config.label}</span>;
}
