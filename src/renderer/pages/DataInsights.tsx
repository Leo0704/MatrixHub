import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { Platform } from '~shared/types';
import { StatCard } from '../components/StatCard';

interface DashboardData {
  todayPublishCount: number;
  successRate: number;
  pendingTasks: number;
  failedTasks24h: number;
  recentAlerts: { id: string; level: string; message: string; createdAt: number }[];
  accountHealth: { platform: Platform; status: string }[];
}

interface MetricPoint {
  timestamp: number;
  value: number;
}

const PLATFORM_NAMES: Record<Platform, { name: string; icon: string; color: string }> = {
  douyin: { name: '抖音', icon: '🎵', color: '#fe2c55' },
  kuaishou: { name: '快手', icon: '📱', color: '#ff4906' },
  xiaohongshu: { name: '小红书', icon: '📕', color: '#fe2c55' },
};

export default function DataInsights() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [trendData, setTrendData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [dashData, metricsData] = await Promise.all([
        window.electronAPI?.getDashboardData(),
        window.electronAPI?.getMetrics('platform_views', undefined, undefined, 30),
      ]);

      setDashboard(dashData ?? null);
      setTrendData(
        (metricsData ?? []).map((m: any) => ({
          timestamp: m.timestamp,
          value: m.value,
        }))
      );
      setError(null);
    } catch (err) {
      console.error('Failed to load insights data:', err);
      setError('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Compute per-platform stats from dashboard data
  const platformStats = dashboard?.accountHealth ?? [];

  return (
    <div>
      {/* 总览统计 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-lg)',
        marginBottom: 'var(--space-xl)'
      }}>
        <StatCard
          label="今日发布"
          value={dashboard?.todayPublishCount?.toString() ?? '--'}
          icon="📤"
          color="var(--primary)"
          loading={loading}
        />
        <StatCard
          label="成功率"
          value={dashboard ? `${(dashboard.successRate * 100).toFixed(1)}%` : '--'}
          icon="✅"
          color="var(--success)"
          loading={loading}
        />
        <StatCard
          label="待处理任务"
          value={dashboard?.pendingTasks?.toString() ?? '--'}
          icon="⏳"
          color="var(--accent-orange)"
          loading={loading}
        />
        <StatCard
          label="24h失败"
          value={dashboard?.failedTasks24h?.toString() ?? '--'}
          icon="❌"
          color="var(--error)"
          loading={loading}
        />
      </div>

      {/* 平台对比 */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>平台状态</h3>

        {loading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-xl)'
          }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 120, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--error)' }}>
            <p>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={loadData}>
              重试
            </button>
          </div>
        ) : platformStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
            暂无平台数据
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-xl)' }}>
            {platformStats.map(({ platform, status }) => {
              const info = PLATFORM_NAMES[platform];
              return (
                <div key={platform} style={{
                  padding: 'var(--space-lg)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-lg)'
                  }}>
                    <span style={{ fontSize: 20 }}>{info?.icon ?? '📦'}</span>
                    <span style={{ fontWeight: 600 }}>{info?.name ?? platform}</span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: status === 'active' ? 'var(--success)' : 'var(--error)',
                      fontWeight: 500,
                    }}>
                      {status === 'active' ? '正常' : '异常'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 趋势图表 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-xl)' }}>
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>数据趋势</h3>
          {loading ? (
            <div style={{ height: 200, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
          ) : trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={ts => new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  labelFormatter={ts => new Date(ts).toLocaleString('zh-CN')}
                  contentStyle={{
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)'
            }}>
              <span style={{ color: 'var(--text-muted)' }}>📈 暂无趋势数据</span>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>账号健康</h3>
          {loading ? (
            <div style={{ height: 200, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />
          ) : dashboard && dashboard.accountHealth.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: 200, justifyContent: 'center' }}>
              {dashboard.accountHealth.map(({ platform, status }) => {
                const info = PLATFORM_NAMES[platform];
                return (
                  <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span>{info?.icon ?? '📦'}</span>
                    <span style={{ fontSize: 13 }}>{info?.name ?? platform}</span>
                    <span style={{
                      marginLeft: 'auto',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: status === 'active' ? 'var(--success)' : 'var(--error)',
                    }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)'
            }}>
              <span style={{ color: 'var(--text-muted)' }}>📊 暂无数据</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
