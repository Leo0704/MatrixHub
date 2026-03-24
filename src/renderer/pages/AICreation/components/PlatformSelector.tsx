import type { Platform } from '~shared/types';

interface PlatformSelectorProps {
  platform: Platform;
  onChange: (platform: Platform) => void;
}

export function PlatformSelector({ platform, onChange }: PlatformSelectorProps) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <label style={labelStyle}>选择平台</label>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        {(['douyin', 'kuaishou', 'xiaohongshu'] as Platform[]).map(p => (
          <button
            key={p}
            className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => onChange(p)}
          >
            {p === 'douyin' ? '🎵 抖音' : p === 'kuaishou' ? '📱 快手' : '📕 小红书'}
          </button>
        ))}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)'
};
