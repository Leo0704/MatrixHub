import type { Task } from '~shared/types';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

const statusLabels: Record<Task['status'], string> = {
  pending: '等待中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  deferred: '延迟',
};

const platformNames: Record<Task['platform'], string> = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
};

function formatTime(timestamp: number | undefined): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN');
}

export default function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const payload = task.payload as { accountId?: string; content?: string };
  const result = task.result as { views?: number; likes?: number; comments?: number } | undefined;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 500, maxWidth: '90vw' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>任务详情</h3>

        {/* 基本信息 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <DetailRow label="标题" value={task.title} />
          <DetailRow label="平台" value={platformNames[task.platform]} />
          <DetailRow label="账号ID" value={payload.accountId || '-'} />
          <DetailRow label="状态" value={statusLabels[task.status]} />
          <DetailRow label="创建时间" value={formatTime(task.createdAt)} />
          <DetailRow label="开始时间" value={formatTime(task.startedAt)} />
          <DetailRow label="完成时间" value={formatTime(task.completedAt)} />
          {task.scheduledAt && (
            <DetailRow label="计划执行" value={formatTime(task.scheduledAt)} />
          )}
        </div>

        {/* 执行结果 */}
        {task.status === 'completed' && result && (
          <div
            style={{
              marginBottom: 'var(--space-lg)',
              padding: 'var(--space-md)',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-sm)',
              }}
            >
              执行结果
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-xl)' }}>
              <Stat label="观看" value={result.views ?? 0} />
              <Stat label="点赞" value={result.likes ?? 0} />
              <Stat label="评论" value={result.comments ?? 0} />
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {task.status === 'failed' && task.error && (
          <div
            style={{
              marginBottom: 'var(--space-lg)',
              padding: 'var(--space-md)',
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              color: 'var(--error)',
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 'var(--space-xs)' }}>错误信息</div>
            <div>{task.error}</div>
          </div>
        )}

        {/* 内容预览 */}
        {payload.content && (
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-sm)',
              }}
            >
              内容预览
            </div>
            <div
              style={{
                padding: 'var(--space-md)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 150,
                overflow: 'auto',
              }}
            >
              {payload.content}
            </div>
          </div>
        )}

        {/* 重试信息 */}
        {(task.retryCount > 0 || task.maxRetries > 0) && (
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              重试次数: {task.retryCount} / {task.maxRetries}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: 'var(--space-sm) 0',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
