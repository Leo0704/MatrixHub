import type { Platform } from '~shared/types';

interface HotTopicWithTrend {
  id: string; title: string; rank: number; heat: number; link: string; coverUrl?: string;
  platform: Platform; fetchedAt: number; trend?: 'up' | 'down' | 'stable'; previousRank?: number; duration?: number;
}

const PLATFORM_NAMES: Record<Platform, { name: string; color: string }> = {
  douyin: { name: '抖音', color: 'var(--platform-douyin)' },
  kuaishou: { name: '快手', color: 'var(--platform-kuaishou)' },
  xiaohongshu: { name: '小红书', color: 'var(--platform-xiaohongshu)' },
};

const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={spinning ? { animation: 'spin 1s linear infinite' } : undefined}>
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const ExportIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const TrendIcon = ({ trend }: { trend?: 'up' | 'down' | 'stable' }) => {
  if (trend === 'up') return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  );
  if (trend === 'down') return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
  return null;
};

const getTrendColor = (trend?: 'up' | 'down' | 'stable') =>
  trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--error)' : 'var(--text-muted)';

interface Props {
  hotTopics: HotTopicWithTrend[];
  loading: boolean;
  error: string | null;
  selectedPlatform: Platform | 'all';
  onRefresh: () => void;
  onPlatformFilter: (platform: Platform | 'all') => void;
  onExport: () => void;
  onCreateFromHotTopic: (topic: HotTopicWithTrend) => void;
}

export function HotTopicsList({ hotTopics, loading, error, selectedPlatform, onRefresh, onPlatformFilter, onExport, onCreateFromHotTopic }: Props) {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <h3>热点话题 TOP10</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {(['all', 'douyin', 'kuaishou', 'xiaohongshu'] as const).map(p => (
              <button key={p} onClick={() => onPlatformFilter(p)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  background: selectedPlatform === p ? 'var(--primary)' : 'var(--bg-elevated)',
                  color: selectedPlatform === p ? 'white' : 'var(--text-secondary)',
                  transition: 'all 150ms ease',
                }}>
                {p === 'all' ? '全部' : PLATFORM_NAMES[p]?.name ?? p}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={onRefresh} disabled={loading} style={{ fontSize: 12, padding: '4px 12px', gap: 5 }}>
            <RefreshIcon spinning={loading} />
            {loading ? '刷新中' : '刷新'}
          </button>
          {hotTopics.length > 0 && (
            <button className="btn btn-secondary" onClick={onExport} style={{ fontSize: 12, padding: '4px 12px', gap: 5 }}>
              <ExportIcon />
              导出
            </button>
          )}
        </div>
      </div>

      {loading && hotTopics.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {[1, 2, 3, 4, 5].map(i => <div key={i} style={{ height: 48, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />)}
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--error)' }}>
          <p>{error}</p><button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onRefresh}>重试</button>
        </div>
      ) : hotTopics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>暂无热点话题数据</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          {hotTopics.slice(0, 10).map((topic, index) => (
            <div key={`${topic.platform}-${topic.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: 'var(--space-sm) var(--space-md)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                transition: 'background 0.15s, border-color 0.15s',
                cursor: 'default',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-overlay)';
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}>
              <span style={{
                width: 24,
                height: 24,
                borderRadius: 'var(--radius-full)',
                background: index < 3 ? 'var(--primary)' : 'var(--bg-overlay)',
                color: index < 3 ? 'white' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
              }}>
                {topic.rank}
              </span>
              <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {topic.title}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: getTrendColor(topic.trend), flexShrink: 0 }}>
                <TrendIcon trend={topic.trend} />
                {topic.trend && topic.previousRank && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>
                    #{topic.previousRank}
                  </span>
                )}
              </span>
              <span style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
                minWidth: 80,
                justifyContent: 'flex-end',
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: 'var(--radius-full)',
                  background: PLATFORM_NAMES[topic.platform]?.color,
                  flexShrink: 0,
                }} />
                {topic.heat.toLocaleString()}
              </span>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px', height: 28, flexShrink: 0 }}
                onClick={() => onCreateFromHotTopic(topic)}
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
                  flexShrink: 0,
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
  );
}
