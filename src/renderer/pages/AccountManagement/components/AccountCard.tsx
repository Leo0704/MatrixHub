import type { Account, AccountGroup } from '~shared/types';

interface Props {
  account: Account;
  groups: AccountGroup[];
  selected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  onEdit: () => void;
}

const PLATFORM_CONFIG: Record<string, {
  name: string;
  color: string;
  icon: React.ReactNode;
}> = {
  douyin: {
    name: '抖音',
    color: 'var(--platform-douyin)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M12.53.02C13.84 0 15.14.01 16.44.05c.72.15 1.1.84 1.08 1.61-.04 1.68-2.21 2.78-4.8 2.76-1.34-.01-2.58-.35-3.62-1.03v5.56c2.44 1.36 5.09 2.08 7.95 2.08 11.54 0 20.93-9.34 20.93-20.86S24.01.01 12.53.01zM8.17 17.94c-1.52 0-2.75-1.23-2.75-2.75s1.23-2.75 2.75-2.75 2.75 1.23 2.75 2.75-1.23 2.75-2.75 2.75zm7.94-11.44c0 2.43-1.93 4.4-4.31 4.4s-4.31-1.97-4.31-4.4 1.93-4.4 4.31-4.4 4.31 1.97 4.31 4.4z"/>
      </svg>
    ),
  },
};

const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);

const DeleteIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

const STATUS_COLORS = {
  active: 'var(--success)',
  error: 'var(--error)',
  pending_validation: 'var(--warning)',
  inactive: 'var(--text-muted)',
};

const STATUS_LABELS = {
  active: '正常',
  error: '异常',
  pending_validation: '待验证',
  inactive: '未激活',
};

export function AccountCard({ account, groups, selected, onToggleSelect, onRemove, onEdit }: Props) {
  const info = PLATFORM_CONFIG[account.platform];
  const group = account.groupId ? groups.find(g => g.id === account.groupId) : null;

  return (
    <div
      className="card"
      style={{
        border: selected ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
        position: 'relative',
        transition: 'border-color 200ms ease',
      }}
    >
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
          aria-label={`选择账号 ${account.displayName}`}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', paddingTop: 'var(--space-xs)' }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--radius-lg)',
          background: `linear-gradient(135deg, ${info.color}, color-mix(in srgb, ${info.color} 70%, #000))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 12px color-mix(in srgb, ${info.color} 40%, transparent)`,
        }}>
          {info.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {account.displayName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{account.username}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: 'var(--radius-full)',
          background: STATUS_COLORS[account.status] ?? STATUS_COLORS.inactive,
          boxShadow: `0 0 6px ${STATUS_COLORS[account.status] ?? STATUS_COLORS.inactive}`,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, color: STATUS_COLORS[account.status] ?? STATUS_COLORS.inactive, fontWeight: 500 }}>
          {STATUS_LABELS[account.status] ?? account.status}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {info.name}
        </span>
      </div>

      {group && (
        <div style={{ fontSize: 12, color: group.color, marginBottom: 'var(--space-sm)', fontWeight: 500 }}>
          {group.name}
        </div>
      )}

      {account.tags && account.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 'var(--space-sm)' }}>
          {account.tags.slice(0, 3).map((tag, i) => (
            <span key={i} style={{
              fontSize: 10,
              padding: '2px 8px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}>
              {tag}
            </span>
          ))}
          {account.tags.length > 3 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
              +{account.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {(account.lastUsedAt || account.lastValidatedAt) && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {account.lastUsedAt && <span>最后使用: {formatTime(account.lastUsedAt)}</span>}
          {account.lastValidatedAt && <span>验证: {formatTime(account.lastValidatedAt)}</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-sm)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-subtle)' }}>
        <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12, gap: 5, height: 34 }} onClick={onEdit}>
          {EditIcon()}
          编辑
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--error)', gap: 5, height: 34 }} onClick={onRemove}>
          {DeleteIcon()}
          删除
        </button>
      </div>
    </div>
  );
}
