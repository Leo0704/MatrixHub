import { useState, useEffect, useCallback } from 'react';
import type { Platform } from '~shared/types';
import { StatCard } from '../../components/StatCard';
import { useAppStore } from '../../stores/appStore';
import { HotTopicsList } from './components/HotTopicsList';
import { PlatformStats } from './components/PlatformStats';
import { DashboardCharts } from './components/DashboardCharts';

interface DashboardData {
  todayPublishCount: number; successRate: number; pendingTasks: number; failedTasks24h: number;
  recentAlerts: { id: string; level: string; message: string; createdAt: number }[];
  accountHealth: { platform: Platform; status: string }[];
}

interface MetricPoint { timestamp: number; value: number; }

interface HotTopicItem {
  id: string; title: string; rank: number; heat: number; link: string; coverUrl?: string; platform: Platform; fetchedAt: number;
}

interface HotTopicWithTrend extends HotTopicItem {
  trend?: 'up' | 'down' | 'stable'; previousRank?: number; duration?: number;
}

interface HistoricalHotTopic {
  id: string; title: string; rank: number; heat: number; platform: Platform; fetchedAt: number;
}

const PLATFORM_NAMES: Record<Platform, { name: string }> = {
  douyin: { name: '抖音' },
  kuaishou: { name: '快手' },
  xiaohongshu: { name: '小红书' },
};

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

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
  const [historicalData, setHistoricalData] = useState<Map<string, HistoricalHotTopic[]>>(new Map());
  const { setHotTopicDraft, setCurrentPage } = useAppStore();

  const handleCreateFromHotTopic = (topic: HotTopicWithTrend) => {
    setHotTopicDraft({ title: topic.title, platform: topic.platform, link: topic.link });
    setCurrentPage('ai');
  };

  const handleExportData = () => {
    const headers = ['排名', '话题', '平台', '热度', '趋势', '原排名', '链接'];
    const rows = hotTopics.map(t => [t.rank, `"${t.title}"`, PLATFORM_NAMES[t.platform]?.name || t.platform, t.heat, t.trend || '', t.previousRank || '', t.link]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hot-topics-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const loadData = useCallback(async () => {
    try {
      const [dashData, metricsData] = await Promise.all([
        window.electronAPI?.getDashboardData(),
        window.electronAPI?.getMetrics('platform_views', undefined, undefined, 30),
      ]);
      setDashboard(dashData ?? null);
      setTrendData((metricsData ?? []).map((m: { timestamp: number; value: number }) => ({ timestamp: m.timestamp, value: m.value })));
      setError(null); setLastUpdated(Date.now());
    } catch (err) { console.error('Failed to load insights data:', err); setError('加载数据失败'); }
    finally { setLoading(false); }
  }, []);

  const loadHotTopics = useCallback(async (platform?: Platform) => {
    setHotTopicsLoading(true); setHotTopicsError(null);
    try {
      const result = await window.electronAPI?.fetchHotTopics(platform);
      if (result?.error) { setHotTopicsError(result.error); return; }
      if (result?.topics) {
        const topicsWithTrend = result.topics.map((topic: HotTopicItem) => {
          const history = historicalData.get(topic.platform) ?? [];
          const previousTopic = history.find(h => h.title === topic.title);
          let trend: 'up' | 'down' | 'stable' = 'stable';
          let previousRank: number | undefined; let duration: number | undefined;
          if (previousTopic) {
            previousRank = previousTopic.rank;
            const rankDiff = previousTopic.rank - topic.rank;
            trend = rankDiff > 0 ? 'up' : rankDiff < 0 ? 'down' : 'stable';
            duration = Math.floor((topic.fetchedAt - previousTopic.fetchedAt) / 60000);
          }
          return { ...topic, trend, previousRank, duration };
        });
        const platformHistory = historicalData.get(platform ?? 'all') ?? [];
        const newHistory = [...platformHistory, ...result.topics];
        const dedupedHistory = Array.from(new Map(newHistory.map(t => [t.title, t])).values()).slice(-100);
        setHistoricalData(prev => { const updated = new Map(prev); updated.set(platform ?? 'all', dedupedHistory); return updated; });
        setHotTopics(topicsWithTrend);
      }
    } catch (err) { console.error('Failed to load hot topics:', err); setHotTopicsError('加载热点话题失败'); }
    finally { setHotTopicsLoading(false); }
  }, [historicalData]);

  useEffect(() => {
    loadData();
    loadHotTopics(selectedPlatform === 'all' ? undefined : selectedPlatform);
    const interval = setInterval(loadData, 60_000);
    const hotTopicsInterval = setInterval(() => loadHotTopics(selectedPlatform === 'all' ? undefined : selectedPlatform), 5 * 60_000);
    return () => { clearInterval(interval); clearInterval(hotTopicsInterval); };
  }, [loadData, loadHotTopics, selectedPlatform]);

  const handleRefresh = useCallback(() => { loadData(); loadHotTopics(selectedPlatform === 'all' ? undefined : selectedPlatform); }, [loadData, loadHotTopics, selectedPlatform]);
  const handlePlatformFilter = useCallback((platform: Platform | 'all') => { setSelectedPlatform(platform); loadHotTopics(platform === 'all' ? undefined : platform); }, [loadHotTopics]);
  const isStale = lastUpdated ? Date.now() - lastUpdated > STALE_THRESHOLD_MS : false;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
        <StatCard label="今日发布" value={dashboard?.todayPublishCount?.toString() ?? '--'} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} color="var(--primary)" loading={loading} />
        <StatCard label="成功率" value={dashboard ? `${(dashboard.successRate * 100).toFixed(1)}%` : '--'} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>} color="var(--success)" loading={loading} />
        <StatCard label="待处理任务" value={dashboard?.pendingTasks?.toString() ?? '--'} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} color="var(--accent)" loading={loading} />
        <StatCard label="24h失败" value={dashboard?.failedTasks24h?.toString() ?? '--'} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>} color="var(--error)" loading={loading} />
      </div>

      <HotTopicsList hotTopics={hotTopics} loading={hotTopicsLoading} error={hotTopicsError} selectedPlatform={selectedPlatform}
        onRefresh={handleRefresh} onPlatformFilter={handlePlatformFilter} onExport={handleExportData} onCreateFromHotTopic={handleCreateFromHotTopic} />

      <PlatformStats platformStats={dashboard?.accountHealth ?? []} loading={loading} error={error} expandedAccount={expandedAccount}
        onToggleExpand={setExpandedAccount} lastUpdated={lastUpdated} />

      <DashboardCharts trendData={trendData} loading={loading} lastUpdated={lastUpdated} isStale={isStale} onRefresh={handleRefresh}
        accountHealth={dashboard?.accountHealth ?? []} />
    </div>
  );
}
