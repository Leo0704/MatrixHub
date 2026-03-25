import { useState } from 'react';
import './ConsentDialog.css';

interface ConsentDialogProps {
  onAccept: () => void;
}

export function ConsentDialog({ onAccept }: ConsentDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="consent-overlay">
      <div className="consent-modal">
        <h2>⚠️ 使用前须知</h2>

        <div className="consent-content">
          <section>
            <h3>📋 平台服务条款风险</h3>
            <p>本应用通过浏览器自动化操作你的账号，可能违反平台服务条款：</p>
            <ul>
              <li><strong>抖音</strong> — 禁止自动化批量操作</li>
              <li><strong>快手</strong> — 禁止机器人行为</li>
              <li><strong>小红书</strong> — 严格限制自动化活动</li>
            </ul>
            <p className="warning">⚠️ <strong>账号可能被封禁</strong>，开发者不承担责任</p>
          </section>

          <section>
            <h3>🔒 数据存储</h3>
            <p>所有凭证和数据仅存储在本地设备。我们不会收集或上传你的任何个人信息。</p>
          </section>

          <section>
            <h3>🤖 AI内容生成</h3>
            <p>AI生成的内容可能受到平台审核。请勿生成违规内容。</p>
          </section>
        </div>

        <label className="consent-checkbox">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={e => setAcknowledged(e.target.checked)}
          />
          <span>我已阅读并理解上述风险，愿意自行承担使用后果</span>
        </label>

        <button
          className="btn btn-primary"
          disabled={!acknowledged}
          onClick={onAccept}
        >
          我已阅读并同意
        </button>
      </div>
    </div>
  );
}
