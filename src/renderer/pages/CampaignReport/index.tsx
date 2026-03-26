import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import './CampaignReport.css';

interface AccountMetrics {
  accountId: string;
  accountName: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  followerDelta: number;
  healthStatus: 'normal' | 'limited' | 'banned';
}

interface CampaignReport {
  campaignId: string;
  generatedAt: number;
  metrics: AccountMetrics[];
  bestAccounts: string[];
  worstAccounts: string[];
  recommendation: 'continue' | 'iterate' | 'stop';
  summary: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  latestReport?: CampaignReport;
}

export function CampaignReportPage() {
  const { selectedCampaignId, setCurrentPage } = useAppStore();
  const campaignId = selectedCampaignId;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    loadCampaign();
  }, [campaignId]);

  const loadCampaign = async () => {
    if (!campaignId) return;
    const api = window.electronAPI as any;
    const result = await api.campaign_get(campaignId);
    if (result.success && result.campaign) {
      setCampaign(result.campaign as Campaign);
    }
    setLoading(false);
  };

  const handleFeedback = async (feedback: 'good' | 'bad') => {
    if (!campaignId) return;
    setFeedbackLoading(true);
    try {
      const api = window.electronAPI as any;
      await api.campaign_feedback(campaignId, feedback);
      setCurrentPage('campaignDashboard');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return n.toString();
  };

  const getHealthBadge = (status: AccountMetrics['healthStatus']) => {
    if (status === 'normal') return '正常';
    if (status === 'limited') return '限流';
    return '封禁';
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (!campaign) return <div className="error">推广活动不存在</div>;

  const report = campaign.latestReport;
  if (!report) return <div className="error">报告暂未生成</div>;

  return (
    <div className="campaign-report">
      <div className="report-header">
        <h1>{campaign.name} - 效果报告</h1>
        <span className="report-time">
          生成时间：{new Date(report.generatedAt).toLocaleString('zh-CN')}
        </span>
      </div>

      <div className="report-summary">
        <p>{report.summary}</p>
        <div className="recommendation">
          建议：
          <span className={`badge badge-${report.recommendation}`}>
            {report.recommendation === 'continue' ? '继续当前策略' :
             report.recommendation === 'iterate' ? '建议优化策略' : '建议停止'}
          </span>
        </div>
      </div>

      {report.worstAccountReasons && report.worstAccountReasons.length > 0 && (
        <div className="worst-reasons">
          <h3>效果最差账号分析</h3>
          <ul>
            {report.worstAccountReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="metrics-table">
        <table>
          <thead>
            <tr>
              <th>账号</th>
              <th>播放</th>
              <th>点赞</th>
              <th>评论</th>
              <th>收藏</th>
              <th>转发</th>
              <th>粉丝变化</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {report.metrics.map(m => (
              <tr key={m.accountId} className={
                report.bestAccounts.includes(m.accountId) ? 'row-best' :
                report.worstAccounts.includes(m.accountId) ? 'row-worst' : ''
              }>
                <td>{m.accountName}</td>
                <td>{formatNumber(m.views)}</td>
                <td>{formatNumber(m.likes)}</td>
                <td>{formatNumber(m.comments)}</td>
                <td>{formatNumber(m.favorites)}</td>
                <td>{formatNumber(m.shares)}</td>
                <td className={m.followerDelta > 0 ? 'positive' : m.followerDelta < 0 ? 'negative' : ''}>
                  {m.followerDelta > 0 ? '+' : ''}{formatNumber(m.followerDelta)}
                </td>
                <td>
                  <span className={`health-badge ${m.healthStatus}`}>
                    {getHealthBadge(m.healthStatus)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="feedback-section">
        <p>这个周期的效果怎么样？</p>
        <div className="feedback-buttons">
          <button
            onClick={() => handleFeedback('good')}
            disabled={feedbackLoading}
            className="btn-good"
          >
            效果好 👍 继续
          </button>
          <button
            onClick={() => handleFeedback('bad')}
            disabled={feedbackLoading}
            className="btn-bad"
          >
            效果不好 👎 换策略
          </button>
        </div>
      </div>
    </div>
  );
}
