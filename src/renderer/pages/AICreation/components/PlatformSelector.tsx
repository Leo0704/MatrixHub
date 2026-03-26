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
  {
    id: 'kuaishou',
    label: '快手',
    color: 'var(--platform-kuaishou)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.02 0C5.84 0 1.46 4.38.01 10.48c-.05.21-.05.42-.05.63 0 4.02 3.36 7.29 7.46 7.29.52 0 1.03-.05 1.52-.15V21.4c0 .65.52 1.17 1.16 1.17.43 0 .8-.22.98-.57l2.83-5.11c2.14.29 4.1-.17 4.1-2.41 0-.21-.03-.42-.08-.63C20.3 4.73 16.61.64 12.02.01V0zm-1.14 13.48c-3.03 0-5.49-2.43-5.49-5.43S7.85 2.62 10.88 2.62s5.49 2.43 5.49 5.43-2.46 5.43-5.49 5.43z"/>
      </svg>
    ),
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    color: 'var(--platform-xiaohongshu)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.34.02C5.64.02 1.98 3.69.27 9.39c-.21.73.22 1.48.86 1.48h.04l.93-.07c.71-.05 1.35-.51 1.47-1.19.13-.74.19-1.5.19-2.27C4.01 3.97 7.74.02 12.34.02zm6.12 8.03c-.12.91-.39 1.79-.76 2.61-.2.45-.69.73-1.18.73-.13 0-.25-.02-.38-.06l-3.18-1.02c-.27-.09-.47-.31-.53-.59-.06-.28.01-.58.18-.77.37-.42.68-.9.91-1.43.2-.45.69-.73 1.18-.73h.04l3.47.95c.27.07.48.29.55.57.06.29-.02.59-.2.79l-.1-.05z"/>
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
