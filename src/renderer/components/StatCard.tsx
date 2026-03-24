import { memo } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  loading?: boolean;
}

export const StatCard = memo(function StatCard({ label, value, icon, color, loading }: StatCardProps) {
  return (
    <div className="card" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)'
    }}>
      {loading ? (
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          animation: 'pulse 1.5s infinite'
        }} />
      ) : (
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
        }}>
          {icon}
        </div>
      )}
      <div>
        {loading ? (
          <div style={{ width: 60, height: 22, borderRadius: 4, background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
        ) : (
          <div style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)'
          }}>
            {value}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
});
