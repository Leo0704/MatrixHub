import type { Platform } from '~shared/types';

interface AccountHealth { platform: Platform; status: string; }

const PLATFORM_NAMES: Record<Platform, { name: string; color: string }> = {
  douyin: { name: '抖音', color: 'var(--platform-douyin)' },
};

interface Props {
  platformStats: AccountHealth[];
  loading: boolean;
  error: string | null;
  expandedAccount: string | null;
  onToggleExpand: (platform: string | null) => void;
  lastUpdated: number | null;
}

export function PlatformStats({ platformStats, loading, error, expandedAccount, onToggleExpand, lastUpdated }: Props) {
  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
      <h3 style={{ marginBottom: 'var(--space-lg)' }}>平台状态</h3>
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-xl)' }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 120, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />)}
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--error)' }}>
          <p>{error}</p>
        </div>
      ) : platformStats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>暂无平台数据</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-xl)' }}>
          {platformStats.map(({ platform, status }) => (
            <div key={platform}
              style={{
                padding: 'var(--space-lg)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-elevated)',
                border: `1px solid ${PLATFORM_NAMES[platform]?.color ?? 'var(--border-subtle)'}`,
                cursor: 'pointer',
                transition: 'border-color 0.2s, transform 0.2s',
              }}
              onClick={() => onToggleExpand(expandedAccount === platform ? null : platform)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: `color-mix(in srgb, ${PLATFORM_NAMES[platform]?.color} 15%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${PLATFORM_NAMES[platform]?.color} 30%, transparent)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={PLATFORM_NAMES[platform]?.color}>
                    <circle cx="12" cy="12" r="10" fillOpacity="0.15"/>
                    <path d="M8 12l3 3 5-5" stroke={PLATFORM_NAMES[platform]?.color} strokeWidth="2" fill="none"/>
                  </svg>
                </div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{PLATFORM_NAMES[platform]?.name ?? platform}</span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: status === 'active' ? 'var(--success-glow)' : 'var(--error-glow)',
                  color: status === 'active' ? 'var(--success)' : 'var(--error)',
                  fontWeight: 500,
                }}>
                  {status === 'active' ? '正常' : '异常'}
                </span>
              </div>
              {expandedAccount === platform && (
                <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)' }}>
                  <div>平台: {PLATFORM_NAMES[platform]?.name}</div>
                  <div>状态: {status === 'active' ? '运行正常' : '需要检查'}</div>
                  <div>最后更新: {lastUpdated ? formatTime(lastUpdated) : '--'}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
