import type { Task } from '~shared/types';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatErrorMessage } from '../../../utils/errorMessage';

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

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  douyin: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
      <path d="M12.53.02C13.84 0 15.14.01 16.44.05c.72.15 1.1.84 1.08 1.61-.04 1.68-2.21 2.78-4.8 2.76-1.34-.01-2.58-.35-3.62-1.03v5.56c2.44 1.36 5.09 2.08 7.95 2.08 11.54 0 20.93-9.34 20.93-20.86S24.01.01 12.53.01zM8.17 17.94c-1.52 0-2.75-1.23-2.75-2.75s1.23-2.75 2.75-2.75 2.75 1.23 2.75 2.75-1.23 2.75-2.75 2.75zm7.94-11.44c0 2.43-1.93 4.4-4.31 4.4s-4.31-1.97-4.31-4.4 1.93-4.4 4.31-4.4 4.31 1.97 4.31 4.4z"/>
    </svg>
  ),
  kuaishou: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
      <path d="M12.02 0C5.84 0 1.46 4.38.01 10.48c-.05.21-.05.42-.05.63 0 4.02 3.36 7.29 7.46 7.29.52 0 1.03-.05 1.52-.15V21.4c0 .65.52 1.17 1.16 1.17.43 0 .8-.22.98-.57l2.83-5.11c2.14.29 4.1-.17 4.1-2.41 0-.21-.03-.42-.08-.63C20.3 4.73 16.61.64 12.02.01V0zm-1.14 13.48c-3.03 0-5.49-2.43-5.49-5.43S7.85 2.62 10.88 2.62s5.49 2.43 5.49 5.43-2.46 5.43-5.49 5.43z"/>
    </svg>
  ),
  xiaohongshu: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
      <path d="M12.34.02C5.64.02 1.98 3.69.27 9.39c-.21.73.22 1.48.86 1.48h.04l.93-.07c.71-.05 1.35-.51 1.47-1.19.13-.74.19-1.5.19-2.27C4.01 3.97 7.74.02 12.34.01V0zm6.12 8.03c-.12.91-.39 1.79-.76 2.61-.2.45-.69.73-1.18.73-.13 0-.25-.02-.38-.06l-3.18-1.02c-.27-.09-.47-.31-.53-.59-.06-.28.01-.58.18-.77.37-.42.68-.9.91-1.43.2-.45.69-.73 1.18-.73h.04l3.47.95c.27.07.48.29.55.57.06.29-.02.59-.2.79l-.1-.05z"/>
    </svg>
  ),
};

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

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

interface ContentCardProps {
  task: Task;
  onCancel: () => void;
  onRetry: () => void;
  onViewDetail: () => void;
  onDuplicate?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function ContentCard({ task, onCancel, onRetry, onViewDetail, onDuplicate, selected, onToggleSelect }: ContentCardProps) {
  const result = task.result as { views?: number; likes?: number; comments?: number } | undefined;
  const platformName = task.platform === 'douyin' ? '抖音' :
                      task.platform === 'kuaishou' ? '快手' : '小红书';

  const payload = task.payload as { accountId?: string; accountName?: string } | undefined;
  const accountName = payload?.accountName || (payload?.accountId ? `账号 ${payload.accountId.slice(0, 8)}...` : null);

  return (
    <div className="card" style={{
      display: 'flex',
      gap: 'var(--space-lg)',
      alignItems: 'flex-start',
      border: selected ? '2px solid var(--primary)' : undefined,
      transition: 'border-color 200ms ease',
    }}>
      {onToggleSelect && (
        <div style={{ flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
        </div>
      )}

      {/* Platform Icon */}
      <div style={{
        width: 120,
        height: 80,
        borderRadius: 'var(--radius-md)',
        background: `color-mix(in srgb, var(--platform-${task.platform}) 8%, var(--bg-elevated))`,
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: `var(--platform-${task.platform})`,
      }}>
        {PLATFORM_ICONS[task.platform]}
      </div>

      {/* Content Info */}
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
          {accountName && (
            <span style={{
              fontSize: 11,
              padding: '2px 6px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
            }}>
              {accountName}
            </span>
          )}
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

        {/* Stats */}
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

        {/* Error */}
        {task.status === 'failed' && task.error && (
          <div style={{
            marginTop: 'var(--space-md)',
            padding: 'var(--space-sm)',
            background: 'var(--error-glow)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            fontSize: 12,
            color: 'var(--error)',
          }}>
            错误: {formatErrorMessage(task.error)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', flexShrink: 0 }}>
        <button
          className="btn btn-ghost"
          title="复制任务"
          onClick={onDuplicate}
          style={{ width: 36, height: 36, padding: 0 }}
        >
          <CopyIcon />
        </button>
        {(task.status === 'pending' || task.status === 'running' || task.status === 'deferred') && (
          <button className="btn btn-ghost" style={{ fontSize: 12, height: 36 }} onClick={onCancel}>
            取消
          </button>
        )}
        {task.status === 'failed' && (
          <button className="btn btn-ghost" style={{ fontSize: 12, height: 36 }} onClick={onRetry}>
            重试
          </button>
        )}
        <button className="btn btn-secondary" style={{ fontSize: 12, height: 36 }} onClick={onViewDetail}>
          详情
        </button>
      </div>
    </div>
  );
}
