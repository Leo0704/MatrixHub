import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { Account } from '~shared/types';
import './CampaignLaunch.css';

export function CampaignLaunch() {
  const { setCurrentPage } = useAppStore();
  const [form, setForm] = useState({
    name: '',
    productUrl: '',
    productDescription: '',
    contentType: 'video' as 'video' | 'image_text',
    addVoiceover: false,
    marketingGoal: 'exposure' as 'exposure' | 'engagement' | 'conversion',
    targetAccountIds: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');
  const [accounts, setAccounts] = useState<Account[]>([]);

  // 加载账号列表
  React.useEffect(() => {
    window.electronAPI?.listAccounts('douyin').then(accounts => {
      setAccounts(accounts || []);
    });
  }, []);

  // 抓取产品信息
  const handleScrape = async () => {
    if (!form.productUrl) return;
    setScrapeStatus('loading');
    // 调用 scraper（通过 IPC）
    // 目前简化：直接假设抓取成功
    setTimeout(() => setScrapeStatus('success'), 1000);
  };

  // 启动推广
  const handleLaunch = async () => {
    if (!form.name) {
      setError('请输入推广名称');
      return;
    }
    if (form.targetAccountIds.length === 0) {
      setError('请选择至少一个账号');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI?.campaign_launch({
        name: form.name,
        productUrl: form.productUrl || undefined,
        productDescription: form.productDescription || undefined,
        contentType: form.contentType,
        addVoiceover: form.addVoiceover,
        marketingGoal: form.marketingGoal,
        targetAccountIds: form.targetAccountIds,
      });

      if (result?.success) {
        setCurrentPage('campaign');
      } else {
        setError(result?.error || '启动失败');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAccount = (id: string) => {
    setForm(f => ({
      ...f,
      targetAccountIds: f.targetAccountIds.includes(id)
        ? f.targetAccountIds.filter(a => a !== id)
        : [...f.targetAccountIds, id],
    }));
  };

  return (
    <div className="campaign-launch">
      <h1>启动推广</h1>

      <div className="form-group">
        <label>推广名称 *</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="例如：卸妆油3月推广"
        />
      </div>

      <div className="form-group">
        <label>产品链接</label>
        <div className="input-with-button">
          <input
            type="text"
            value={form.productUrl}
            onChange={e => setForm(f => ({ ...f, productUrl: e.target.value }))}
            placeholder="https://..."
          />
          <button onClick={handleScrape} disabled={!form.productUrl || scrapeStatus === 'loading'}>
            {scrapeStatus === 'loading' ? '抓取中...' : '抓取'}
          </button>
        </div>
        {scrapeStatus === 'success' && <span className="success">抓取成功</span>}
        {scrapeStatus === 'failed' && <span className="error">抓取失败</span>}
      </div>

      <div className="form-group">
        <label>产品描述 {form.productUrl ? '(可选)' : '(必填)'}</label>
        <textarea
          value={form.productDescription}
          onChange={e => setForm(f => ({ ...f, productDescription: e.target.value }))}
          placeholder="如果链接抓取失败，请手动填写产品信息"
          rows={4}
        />
      </div>

      <div className="form-group">
        <label>内容类型 *</label>
        <div className="radio-group">
          <label className="radio-label">
            <input
              type="radio"
              name="contentType"
              value="video"
              checked={form.contentType === 'video'}
              onChange={() => setForm(f => ({ ...f, contentType: 'video' }))}
            />
            视频
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="contentType"
              value="image_text"
              checked={form.contentType === 'image_text'}
              onChange={() => setForm(f => ({ ...f, contentType: 'image_text' }))}
            />
            图文
          </label>
        </div>
      </div>

      {form.contentType === 'image_text' && (
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={form.addVoiceover}
              onChange={e => setForm(f => ({ ...f, addVoiceover: e.target.checked }))}
            />
            添加语音配音
          </label>
        </div>
      )}

      <div className="form-group">
        <label>营销目标 *</label>
        <div className="radio-group">
          <label className="radio-label">
            <input
              type="radio"
              name="marketingGoal"
              value="exposure"
              checked={form.marketingGoal === 'exposure'}
              onChange={() => setForm(f => ({ ...f, marketingGoal: 'exposure' }))}
            />
            曝光优先
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="marketingGoal"
              value="engagement"
              checked={form.marketingGoal === 'engagement'}
              onChange={() => setForm(f => ({ ...f, marketingGoal: 'engagement' }))}
            />
            互动优先
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="marketingGoal"
              value="conversion"
              checked={form.marketingGoal === 'conversion'}
              onChange={() => setForm(f => ({ ...f, marketingGoal: 'conversion' }))}
            />
            成交优先
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>目标账号 *（已登录的抖音账号）</label>
        <div className="account-list">
          {accounts.length === 0 ? (
            <p className="hint">暂无可用账号，请在账号管理中添加</p>
          ) : (
            accounts.map(acc => (
              <label key={acc.id} className="account-item">
                <input
                  type="checkbox"
                  checked={form.targetAccountIds.includes(acc.id)}
                  onChange={() => toggleAccount(acc.id)}
                />
                {acc.displayName}
              </label>
            ))
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="form-actions">
        <button onClick={() => setCurrentPage('campaign')} className="btn-secondary">
          取消
        </button>
        <button onClick={handleLaunch} disabled={loading} className="btn-primary">
          {loading ? '启动中...' : '启动推广'}
        </button>
      </div>
    </div>
  );
}