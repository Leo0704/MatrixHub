import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface MetricPoint { timestamp: number; value: number; }

interface AccountHealth { platform: string; status: string; }

const PLATFORM_CONFIG: Record<string, { name: string; color: string }> = {
  douyin: { name: '抖音', color: 'var(--platform-douyin)' },
};

const RefreshIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const TrendUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

const ChartEmptyIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

interface Props {
  trendData: MetricPoint[];
  loading: boolean;
  lastUpdated: number | null;
  isStale: boolean;
  onRefresh: () => void;
  accountHealth: AccountHealth[];
}

export function DashboardCharts({ trendData, loading, lastUpdated, isStale, onRefresh, accountHealth }: Props) {
  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-xl)' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <h3>抖音浏览量趋势(近30天)</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            {lastUpdated && (
              <span style={{ fontSize: 12, color: isStale ? 'var(--warning)' : 'var(--text-muted)' }}>
                最后更新: {formatTime(lastUpdated)}{isStale && ' · 数据可能过期'}
              </span>
            )}
            <button className="btn btn-secondary" onClick={onRefresh} style={{ fontSize: 12, padding: '4px 12px', gap: 5 }}>
              <RefreshIcon />
              刷新
            </button>
          </div>
        </div>
        {loading ? (
          <div style={{ height: 200, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
        ) : trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <XAxis dataKey="timestamp" tickFormatter={ts => new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={val => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip labelFormatter={ts => new Date(ts as number).toLocaleString('zh-CN')} formatter={(value) => [typeof value === 'number' ? value.toLocaleString() : String(value), '浏览量']} contentStyle={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', gap: 'var(--space-sm)' }}>
            <div style={{ color: 'var(--text-disabled)' }}><TrendUpIcon /></div>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无趋势数据</span>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>账号健康</h3>
        {loading ? (
          <div style={{ height: 200, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
        ) : accountHealth.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: 200, justifyContent: 'center' }}>
            {accountHealth.map(({ platform, status }) => {
              const info = PLATFORM_CONFIG[platform];
              return (
                <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: 'var(--radius-full)',
                    background: info?.color ?? 'var(--text-muted)',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{info?.name ?? platform}</span>
                  <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: status === 'active' ? 'var(--success)' : 'var(--error)' }} />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', gap: 'var(--space-sm)' }}>
            <div style={{ color: 'var(--text-disabled)' }}><ChartEmptyIcon /></div>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无数据</span>
          </div>
        )}
      </div>
    </div>
  );
}
