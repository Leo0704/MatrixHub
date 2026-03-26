import type { Account } from '~shared/types';

interface PipelineConfigProps {
  config: {
    contentType: 'image' | 'video';
    imageCount?: 3 | 6 | 9;      // 仅图片集模式
    generateVoice?: boolean;     // 仅图片集模式，配音作为语音版本附件
    autoPublish: boolean;
    targetAccounts: string[];
  };
  accounts: Account[];
  onChange: (config: PipelineConfigProps['config']) => void;
}

export function PipelineConfig({ config, accounts, onChange }: PipelineConfigProps) {
  return (
    <div className="pipeline-config">
      <h4>内容类型</h4>
      <div className="content-type-selector">
        <label className={`content-type-option ${config.contentType === 'image' ? 'selected' : ''}`}>
          <input
            type="radio"
            name="contentType"
            value="image"
            checked={config.contentType === 'image'}
            onChange={() => onChange({ ...config, contentType: 'image' })}
          />
          <div className="content-type-info">
            <span className="content-type-title">📷 图片集</span>
            <span className="content-type-desc">生成图文内容，适合展示产品细节</span>
          </div>
        </label>
        <label className={`content-type-option ${config.contentType === 'video' ? 'selected' : ''}`}>
          <input
            type="radio"
            name="contentType"
            value="video"
            checked={config.contentType === 'video'}
            onChange={() => onChange({ ...config, contentType: 'video' })}
          />
          <div className="content-type-info">
            <span className="content-type-title">🎬 视频</span>
            <span className="content-type-desc">生成短视频，视频自带音频</span>
          </div>
        </label>
      </div>

      {/* 图片集模式额外配置 */}
      {config.contentType === 'image' && (
        <>
          <h4>图片数量</h4>
          <div className="image-count-selector">
            {[3, 6, 9].map(count => (
              <button
                key={count}
                className={`btn ${config.imageCount === count ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onChange({ ...config, imageCount: count as 3 | 6 | 9 })}
              >
                {count} 张
              </button>
            ))}
          </div>

          <h4>附加选项</h4>
          <div className="config-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={config.generateVoice || false}
                onChange={(e) => onChange({ ...config, generateVoice: e.target.checked })}
              />
              同时生成配音（语音版本附件）
            </label>
          </div>
        </>
      )}

      <h4>发布设置</h4>
      <div className="config-checkboxes">
        <label>
          <input
            type="checkbox"
            checked={config.autoPublish}
            onChange={(e) => onChange({ ...config, autoPublish: e.target.checked })}
          />
          自动发布
        </label>
      </div>

      {config.autoPublish && (
        <div className="account-selection">
          <label>选择发布账号：</label>
          <div className="account-list">
            {accounts.map((account) => (
              <label key={account.id}>
                <input
                  type="checkbox"
                  checked={config.targetAccounts.includes(account.id)}
                  onChange={(e) => {
                    const newAccounts = e.target.checked
                      ? [...config.targetAccounts, account.id]
                      : config.targetAccounts.filter((id) => id !== account.id);
                    onChange({ ...config, targetAccounts: newAccounts });
                  }}
                />
                {account.displayName || account.username}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
