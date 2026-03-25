import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { Platform } from '~shared/types';
import { StatCard } from '../components/StatCard';
import { useAppStore } from '../stores/appStore';

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

interface HotTopicItem {
  id: string;
  title: string;
  rank: number;
  heat: number;
  link: string;
  coverUrl?: string;
  platform: Platform;
  fetchedAt: number;
}

interface HotTopicWithTrend extends HotTopicItem {
  trend?: 'up' | 'down' | 'stable';
  previousRank?: number;
  duration?: number; // 持续时间（分钟）
}

interface HistoricalHotTopic {
  id: string;
  title: string;
  rank: number;
  heat: number;
  platform: Platform;
  fetchedAt: number;
}

const PLATFORM_NAMES: Record<Platform, { name: string; icon: string; color: string }> = {
  douyin: { name: '抖音', icon: '🎵', color: '#fe2c55' },
  kuaishou: { name: '快手', icon: '📱', color: '#ff4906' },
  xiaohongshu: { name: '小红书', icon: '📕', color: '#fe2c55' },
};

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5分钟

export default function DataInsights() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [trendData, setTrendData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [hotTopics, setHotTopics] = useState<HotTopicWithTrend[]>([]);
  const [hotTopicsLoading, setHotTopicsLoading] = useState(false);
  const [hotTopicsError, setHotTopicsError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | 'all'>('all');
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  // 历史数据存储（用于计算趋势）
  const [historicalData, setHistoricalData] = useState<Map<string, HistoricalHotTopic[]>>(new Map());

  const { setHotTopicDraft, setCurrentPage } = useAppStore();

  const handleCreateFromHotTopic = (topic: HotTopicWithTrend) => {
    setHotTopicDraft({
      title: topic.title,
      platform: topic.platform,
      link: topic.link,
    });
    setCurrentPage('ai');
  };

  const handleExportData = () => {
    // 导出热点话题数据为 CSV
    const headers = ['排名', '话题', '平台', '热度', '趋势', '原排名', '链接'];
    const rows = hotTopics.map(t => [
      t.rank,
      `"${t.title}"`,
      PLATFORM_NAMES[t.platform]?.name || t.platform,
      t.heat,
      t.trend || '',
      t.previousRank || '',
      t.link,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hot-topics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadData = useCallback(async () => {
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
      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Failed to load insights data:', err);
      setError('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHotTopics = useCallback(async (platform?: Platform) => {
    setHotTopicsLoading(true);
    setHotTopicsError(null);

    try {
      const result = await window.electronAPI?.fetchHotTopics(platform);
      if (result?.error) {
        setHotTopicsError(result.error);
        return;
      }

      if (result?.topics) {
        // 计算趋势
        const topicsWithTrend = result.topics.map((topic: HotTopicItem) => {
          const history = historicalData.get(topic.platform) ?? [];
          const previousTopic = history.find(h => h.title === topic.title);

          let trend: 'up' | 'down' | 'stable' = 'stable';
          let previousRank: number | undefined;
          let duration: number | undefined;

          if (previousTopic) {
            previousRank = previousTopic.rank;
            const rankDiff = previousTopic.rank - topic.rank; // 正数表示上升
            if (rankDiff > 0) trend = 'up';
            else if (rankDiff < 0) trend = 'down';
            duration = Math.floor((topic.fetchedAt - previousTopic.fetchedAt) / 60000); // 分钟
          }

          return { ...topic, trend, previousRank, duration };
        });

        // 更新历史数据
        const platformHistory = historicalData.get(platform ?? 'all') ?? [];
        const newHistory = [...platformHistory, ...result.topics];
        // 只保留最近的数据（去重保留最新）
        const dedupedHistory = Array.from(
          new Map(newHistory.map(t => [t.title, t])).values()
        ).slice(-100); // 最多保留100条

        setHistoricalData(prev => {
          const updated = new Map(prev);
          updated.set(platform ?? 'all', dedupedHistory);
          return updated;
        });

        setHotTopics(topicsWithTrend);
      }
    } catch (err) {
      console.error('Failed to load hot topics:', err);
      setHotTopicsError('加载热点话题失败');
    } finally {
      setHotTopicsLoading(false);
    }
  }, [historicalData]);

  useEffect(() => {
    loadData();
    loadHotTopics(selectedPlatform === 'all' ? undefined : selectedPlatform);
    const interval = setInterval(loadData, 60_000);
    const hotTopicsInterval = setInterval(() => {
      loadHotTopics(selectedPlatform === 'all' ? undefined : selectedPlatform);
    }, 5 * 60_000); // 5分钟刷新热点话题
    return () => {
      clearInterval(interval);
      clearInterval(hotTopicsInterval);
    };
  }, [loadData, loadHotTopics, selectedPlatform]);

  const handleRefresh = useCallback(() => {
    loadData();
    loadHotTopics(selectedPlatform === 'all' ? undefined : selectedPlatform);
  }, [loadData, loadHotTopics, selectedPlatform]);

  const handlePlatformFilter = useCallback((platform: Platform | 'all') => {
    setSelectedPlatform(platform);
    loadHotTopics(platform === 'all' ? undefined : platform);
  }, [loadHotTopics]);

  // Compute per-platform stats from dashboard data
  const platformStats = dashboard?.accountHealth ?? [];

  const isStale = lastUpdated ? Date.now() - lastUpdated > STALE_THRESHOLD_MS : false;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '';
  };

  const getTrendColor = (trend?: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return 'var(--success)';
    if (trend === 'down') return 'var(--error)';
    return 'var(--text-muted)';
  };

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

      {/* 热点话题列表 */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-lg)'
        }}>
          <h3>热点话题 TOP10</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            {/* 平台筛选 */}
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              {(['all', 'douyin', 'kuaishou', 'xiaohongshu'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => handlePlatformFilter(p)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 500,
                    background: selectedPlatform === p ? 'var(--primary)' : 'var(--bg-elevated)',
                    color: selectedPlatform === p ? 'white' : 'var(--text)',
                  }}
                >
                  {p === 'all' ? '全部' : PLATFORM_NAMES[p]?.name ?? p}
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleRefresh}
              disabled={hotTopicsLoading}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              {hotTopicsLoading ? '刷新中...' : '🔄 刷新'}
            </button>
            {hotTopics.length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={handleExportData}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                📥 导出
              </button>
            )}
          </div>
        </div>

        {hotTopicsLoading && hotTopics.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{
                height: 48,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                animation: 'pulse 1.5s infinite'
              }} />
            ))}
          </div>
        ) : hotTopicsError ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--error)' }}>
            <p>{hotTopicsError}</p>
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={handleRefresh}>
              重试
            </button>
          </div>
        ) : hotTopics.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
            暂无热点话题数据
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {hotTopics.slice(0, 10).map((topic, index) => (
              <div
                key={`${topic.platform}-${topic.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-md)',
                  padding: 'var(--space-sm) var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-elevated)',
                  color: 'inherit',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-overlay)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              >
                <span style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--radius-full)',
                  background: index < 3 ? 'var(--primary)' : 'var(--bg-overlay)',
                  color: index < 3 ? 'white' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {topic.rank}
                </span>
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {topic.title}
                </span>
                <span style={{
                  fontSize: 11,
                  color: getTrendColor(topic.trend),
                  fontWeight: 500,
                }}>
                  {getTrendIcon(topic.trend)}
                  {topic.trend && topic.previousRank && (
                    <span style={{ marginLeft: 4, color: 'var(--text-muted)' }}>
                      #{topic.previousRank} → #{topic.rank}
                    </span>
                  )}
                </span>
                <span style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <span>{PLATFORM_NAMES[topic.platform]?.icon}</span>
                  <span>{topic.heat.toLocaleString()}</span>
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => handleCreateFromHotTopic(topic)}
                  title="以此话题创作内容"
                >
                  创作
                </button>
                <a
                  href={topic.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    padding: '4px 8px',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  查看
                </a>
              </div>
            ))}
          </div>
        )}
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
            {platformStats.map(({ platform, status }) => (
              <div
                key={platform}
                style={{
                  padding: 'var(--space-lg)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onClick={() => setExpandedAccount(expandedAccount === platform ? null : platform)}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  marginBottom: 'var(--space-lg)'
                }}>
                  <span style={{ fontSize: 20 }}>{PLATFORM_NAMES[platform]?.icon ?? '📦'}</span>
                  <span style={{ fontWeight: 600 }}>{PLATFORM_NAMES[platform]?.name ?? platform}</span>
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
                {expandedAccount === platform && (
                  <div style={{
                    marginTop: 'var(--space-md)',
                    padding: 'var(--space-sm)',
                    background: 'var(--bg-overlay)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 12,
                    color: 'var(--text-muted)'
                  }}>
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

      {/* 趋势图表 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-xl)' }}>
        <div className="card">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-lg)'
          }}>
            <h3>抖音浏览量趋势(近30天)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              {lastUpdated && (
                <span style={{
                  fontSize: 12,
                  color: isStale ? 'var(--warning)' : 'var(--text-muted)',
                }}>
                  最后更新: {formatTime(lastUpdated)}
                  {isStale && ' ⚠️ 数据可能过期'}
                </span>
              )}
              <button
                className="btn btn-secondary"
                onClick={handleRefresh}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                🔄 刷新
              </button>
            </div>
          </div>
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
                <YAxis
                  tickFormatter={val => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  labelFormatter={ts => new Date(ts).toLocaleString('zh-CN')}
                  formatter={(value: number) => [value.toLocaleString(), '浏览量']}
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
