import type { Platform } from '~shared/types';

interface PlatformSelectorProps {
  platform: Platform;
  onChange: (platform: Platform) => void;
}

const PLATFORMS: { id: Platform; label: string; color: string; icon: React.ReactNode }[] = [
  {
    id: 'douyin',
    label: '抖音',
    color: 'var(--platform-douyin)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.53.02C13.84 0 15.14.01 16.44.05c.72.15 1.1.84 1.08 1.61-.04 1.68-2.21 2.78-4.8 2.76-1.34-.01-2.58-.35-3.62-1.03v5.56c2.44 1.36 5.09 2.08 7.95 2.08 11.54 0 20.93-9.34 20.93-20.86S24.01.01 12.53.01zM8.17 17.94c-1.52 0-2.75-1.23-2.75-2.75s1.23-2.75 2.75-2.75 2.75 1.23 2.75 2.75-1.23 2.75-2.75 2.75zm7.94-11.44c0 2.43-1.93 4.4-4.31 4.4s-4.31-1.97-4.31-4.4 1.93-4.4 4.31-4.4 4.31 1.97 4.31 4.4z"/>
      </svg>
    ),
  },
];

export function PlatformSelector({ platform, onChange }: PlatformSelectorProps) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <label style={labelStyle}>选择平台</label>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        {PLATFORMS.map(p => {
          const isActive = platform === p.id;
          return (
            <button
              key={p.id}
              className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                flex: 1,
                fontSize: 13,
                gap: '6px',
                ...(isActive && { color: p.color, background: `color-mix(in srgb, ${p.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${p.color} 30%, transparent)` }),
              }}
              onClick={() => onChange(p.id)}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: isActive ? p.color : 'inherit' }}>
                {p.icon}
              </span>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)',
};
