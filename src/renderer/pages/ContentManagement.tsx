import { useState } from 'react';
import type { Task } from '../types';

const mockContent: Task[] = [
  {
    id: '1',
    type: 'publish',
    platform: 'douyin',
    status: 'completed',
    title: '【干货】5个技巧让你的视频爆款',
    payload: { views: 12500, likes: 890, comments: 45 },
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now() - 86400000,
    completedAt: Date.now() - 86400000,
  },
  {
    id: '2',
    type: 'publish',
    platform: 'xiaohongshu',
    status: 'completed',
    title: '春日穿搭灵感｜一周不重样',
    payload: { views: 8300, likes: 620, comments: 28 },
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now() - 172800000,
    completedAt: Date.now() - 172800000,
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
    createdAt: Date.now() - 3600000,
  },
];

export default function ContentManagement() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'douyin' | 'kuaishou' | 'xiaohongshu'>('all');

  const filteredContent = mockContent.filter(task => {
    if (filter !== 'all' && task.status !== filter) return false;
    if (selectedPlatform !== 'all' && task.platform !== selectedPlatform) return false;
    return true;
  });

  return (
    <div>
      {/* 操作栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-xl)'
      }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <select
            className="input"
            style={{ width: 120 }}
            value={selectedPlatform}
            onChange={e => setSelectedPlatform(e.target.value as any)}
          >
            <option value="all">全部平台</option>
            <option value="douyin">抖音</option>
            <option value="kuaishou">快手</option>
            <option value="xiaohongshu">小红书</option>
          </select>

          <select
            className="input"
            style={{ width: 120 }}
            value={filter}
            onChange={e => setFilter(e.target.value as any)}
          >
            <option value="all">全部状态</option>
            <option value="pending">等待中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>

        <button className="btn btn-primary">
          + 新建内容
        </button>
      </div>

      {/* 内容列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {filteredContent.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <h3>暂无内容</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              创建你的第一个内容任务吧
            </p>
          </div>
        ) : (
          filteredContent.map(content => (
            <ContentCard key={content.id} content={content} />
          ))
        )}
      </div>
    </div>
  );
}

function ContentCard({ content }: { content: Task }) {
  const result = content.payload as { views?: number; likes?: number; comments?: number };

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
        {content.platform === 'douyin' ? '🎵' :
         content.platform === 'kuaishou' ? '📱' : '📕'}
      </div>

      {/* 内容信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xs)'
        }}>
          <span className={`badge badge-platform-${content.platform}`}>
            {content.platform === 'douyin' ? '抖音' :
             content.platform === 'kuaishou' ? '快手' : '小红书'}
          </span>
          <StatusBadge status={content.status} />
        </div>

        <h3 style={{
          fontSize: 16,
          fontWeight: 500,
          marginBottom: 'var(--space-sm)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {content.title}
        </h3>

        <div style={{
          display: 'flex',
          gap: 'var(--space-lg)',
          fontSize: 13,
          color: 'var(--text-secondary)'
        }}>
          <span>创建于 {formatTime(content.createdAt)}</span>
          {content.scheduledAt && (
            <span>计划发布 {formatTime(content.scheduledAt)}</span>
          )}
        </div>

        {/* 数据统计 */}
        {content.status === 'completed' && result.views !== undefined && (
          <div style={{
            display: 'flex',
            gap: 'var(--space-xl)',
            marginTop: 'var(--space-md)',
            paddingTop: 'var(--space-md)',
            borderTop: '1px solid var(--border-subtle)'
          }}>
            <Stat label="观看" value={formatNumber(result.views)} />
            <Stat label="点赞" value={formatNumber(result.likes ?? 0)} />
            <Stat label="评论" value={formatNumber(result.comments ?? 0)} />
          </div>
        )}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button className="btn btn-ghost" style={{ fontSize: 13 }}>
          编辑
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 13 }}>
          详情
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Task['status'] }) {
  const config = {
    pending: { label: '等待中', color: 'var(--text-muted)' },
    running: { label: '执行中', color: 'var(--primary)' },
    completed: { label: '已完成', color: 'var(--success)' },
    failed: { label: '失败', color: 'var(--error)' },
    cancelled: { label: '已取消', color: 'var(--text-muted)' },
    deferred: { label: '延迟', color: 'var(--warning)' },
  };

  const c = config[status];

  return (
    <span style={{
      fontSize: 11,
      padding: '2px 6px',
      borderRadius: 'var(--radius-sm)',
      background: `${c.color}15`,
      color: c.color,
      fontWeight: 500,
    }}>
      {c.label}
    </span>
  );
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

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}
