import { memo } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
  trend?: 'up' | 'down' | 'neutral';
}

const TREND_ICONS = {
  up: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  down: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  neutral: null,
};

export const StatCard = memo(function StatCard({ label, value, icon, color, loading, trend }: StatCardProps) {
  if (loading) {
    return (
      <div className="card" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg)',
        padding: 'var(--space-xl)',
      }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: 64, height: 28, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: 80, height: 14 }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="card animate-fade-in-up"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg)',
        padding: 'var(--space-xl)',
        cursor: 'default',
        transition: 'transform 200ms var(--ease-out), box-shadow 200ms ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 'var(--radius-md)',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color,
        flexShrink: 0,
        transition: 'transform 200ms var(--spring)',
      }}>
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 26,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-sm)',
        }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          {trend && trend !== 'neutral' && (
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: trend === 'up' ? 'var(--success)' : 'var(--error)',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}>
              {TREND_ICONS[trend]}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          fontWeight: 500,
          marginTop: 2,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}>
          {label}
        </div>
      </div>
    </div>
  );
});
