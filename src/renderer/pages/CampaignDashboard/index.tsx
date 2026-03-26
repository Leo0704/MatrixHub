import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import './CampaignDashboard.css';

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'waiting_feedback' | 'iterating' | 'completed' | 'failed';
  contentType: 'video' | 'image_text';
  marketingGoal: 'exposure' | 'engagement' | 'conversion';
  targetAccountIds: string[];
  createdAt: number;
  currentIteration: number;
}

export function CampaignDashboard() {
  const { setCurrentPage } = useAppStore();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCampaigns();

    // 监听更新事件 - these events will be added when campaign functionality is implemented
    const api = window.electronAPI as any;
    if (!api) return;

    const handler = () => loadCampaigns();
    api.on('campaign:updated', handler);
    api.on('campaign:started', handler);
    api.on('campaign:report-ready', handler);
    api.on('campaign:continued', handler);
    api.on('campaign:iterating', handler);
    api.on('campaign:failed', handler);

    return () => {
      api.off('campaign:updated', handler);
      api.off('campaign:started', handler);
      api.off('campaign:report-ready', handler);
      api.off('campaign:continued', handler);
      api.off('campaign:iterating', handler);
      api.off('campaign:failed', handler);
    };
  }, []);

  const loadCampaigns = async () => {
    const api = window.electronAPI as any;
    if (!api) {
      setLoading(false);
      return;
    }

    try {
      const result = await api.campaign_list();
      if (result && result.success) {
        setCampaigns(result.campaigns || []);
      }
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
    setLoading(false);
  };

  const handleLaunchCampaign = () => {
    setCurrentPage('campaignLaunch');
  };

  const handleCampaignClick = (campaignId: string) => {
    setCurrentPage('campaignReport', campaignId);
  };

  const getStatusLabel = (status: Campaign['status']) => {
    const labels: Record<string, string> = {
      draft: '草稿',
      running: '进行中',
      waiting_feedback: '待反馈',
      iterating: '迭代中',
      completed: '已完成',
      failed: '已停止',
    };
    return labels[status] || status;
  };

  const getStatusClass = (status: Campaign['status']) => {
    if (status === 'running' || status === 'iterating') return 'status-running';
    if (status === 'waiting_feedback') return 'status-waiting';
    if (status === 'failed') return 'status-failed';
    if (status === 'completed') return 'status-completed';
    return '';
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="campaign-dashboard">
      <div className="dashboard-header">
        <h1>推广活动</h1>
        <button onClick={handleLaunchCampaign} className="btn-primary">
          启动新推广
        </button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : campaigns.length === 0 ? (
        <div className="empty">
          <p>暂无推广活动</p>
          <button onClick={handleLaunchCampaign} className="btn-primary">
            启动第一个推广
          </button>
        </div>
      ) : (
        <div className="campaign-list">
          {campaigns.map(campaign => (
            <div
              key={campaign.id}
              className="campaign-card"
              onClick={() => handleCampaignClick(campaign.id)}
            >
              <div className="campaign-header">
                <h3>{campaign.name}</h3>
                <span className={`status ${getStatusClass(campaign.status)}`}>
                  {getStatusLabel(campaign.status)}
                </span>
              </div>
              <div className="campaign-info">
                <span>类型：{campaign.contentType === 'video' ? '视频' : '图文'}</span>
                <span>目标：{
                  campaign.marketingGoal === 'exposure' ? '曝光优先' :
                  campaign.marketingGoal === 'engagement' ? '互动优先' : '成交优先'
                }</span>
              </div>
              <div className="campaign-meta">
                <span>账号：{campaign.targetAccountIds.length}个</span>
                {campaign.currentIteration > 0 && (
                  <span>迭代：{campaign.currentIteration}轮</span>
                )}
                <span>{formatDate(campaign.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
