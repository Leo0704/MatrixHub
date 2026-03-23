export default function DataInsights() {
  const platformData = {
    douyin: {
      views: 125000,
      likes: 8900,
      comments: 450,
      followers: 1200,
      growth: 5.2,
    },
    kuaishou: {
      views: 89000,
      likes: 6200,
      comments: 320,
      followers: 850,
      growth: 3.8,
    },
    xiaohongshu: {
      views: 45000,
      likes: 3800,
      comments: 210,
      followers: 560,
      growth: 8.1,
    },
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
        <StatCard label="总观看" value="259k" icon="👁️" color="var(--primary)" />
        <StatCard label="总点赞" value="18.9k" icon="❤️" color="var(--error)" />
        <StatCard label="总评论" value="980" icon="💬" color="var(--info)" />
        <StatCard label="总粉丝" value="2.6k" icon="👥" color="var(--success)" />
      </div>

      {/* 平台对比 */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>平台数据对比</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-xl)' }}>
          {Object.entries(platformData).map(([platform, data]) => (
            <PlatformDataCard key={platform} platform={platform as any} data={data} />
          ))}
        </div>
      </div>

      {/* 趋势图表占位 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-xl)' }}>
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>数据趋势</h3>
          <div style={{
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)'
          }}>
            <span style={{ color: 'var(--text-muted)' }}>📈 趋势图表</span>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>粉丝增长</h3>
          <div style={{
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)'
          }}>
            <span style={{ color: 'var(--text-muted)' }}>📊 环形图</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="card">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)'
      }}>
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
        <div>
          <div style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)'
          }}>
            {value}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function PlatformDataCard({ platform, data }: {
  platform: 'douyin' | 'kuaishou' | 'xiaohongshu';
  data: { views: number; likes: number; comments: number; followers: number; growth: number };
}) {
  const info = {
    douyin: { name: '抖音', icon: '🎵', color: 'var(--platform-douyin)' },
    kuaishou: { name: '快手', icon: '📱', color: 'var(--platform-kuaishou)' },
    xiaohongshu: { name: '小红书', icon: '📕', color: 'var(--platform-xiaohongshu)' },
  };

  return (
    <div style={{
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
        <span style={{ fontSize: 20 }}>{info[platform].icon}</span>
        <span style={{ fontWeight: 600 }}>{info[platform].name}</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 12,
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          background: data.growth > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: data.growth > 0 ? 'var(--success)' : 'var(--error)',
          fontWeight: 500,
        }}>
          {data.growth > 0 ? '+' : ''}{data.growth}%
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <DataPoint label="观看" value={formatNumber(data.views)} />
        <DataPoint label="点赞" value={formatNumber(data.likes)} />
        <DataPoint label="评论" value={formatNumber(data.comments)} />
        <DataPoint label="粉丝" value={formatNumber(data.followers)} />
      </div>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 18,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)'
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}
