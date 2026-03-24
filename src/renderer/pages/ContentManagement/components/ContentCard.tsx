import type { Task } from '~shared/types';
import { StatusBadge } from '../../../components/StatusBadge';

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
}

export function ContentCard({ task, onCancel, onRetry, onViewDetail }: ContentCardProps) {
  const result = task.result as { views?: number; likes?: number; comments?: number } | undefined;
  const platformName = task.platform === 'douyin' ? '抖音' :
                      task.platform === 'kuaishou' ? '快手' : '小红书';

  return (
    <div className="card" style={{
      display: 'flex',
      gap: 'var(--space-lg)',
      alignItems: 'flex-start'
    }}>
      {/* 缩略图占位 */}
      <div style={{
        width: 120,
        height: 80,
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {task.platform === 'douyin' ? '🎵' :
         task.platform === 'kuaishou' ? '📱' : '📕'}
      </div>

      {/* 内容信息 */}
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

        {/* 数据统计 */}
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

        {/* 错误信息 */}
        {task.status === 'failed' && task.error && (
          <div style={{
            marginTop: 'var(--space-md)',
            padding: 'var(--space-sm)',
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--error)',
          }}>
            错误: {task.error}
          </div>
        )}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        {(task.status === 'pending' || task.status === 'running' || task.status === 'deferred') && (
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onCancel}>
            取消
          </button>
        )}
        {task.status === 'failed' && (
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onRetry}>
            重试
          </button>
        )}
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onViewDetail}>
          详情
        </button>
      </div>
    </div>
  );
}
