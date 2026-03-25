import { useState, useEffect } from 'react';
import './AIStatusIndicator.css';

interface AIStatus {
  connected: boolean;
  provider?: string;
  error?: string;
}

export function AIStatusIndicator() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI?.testAIConnection({} as { baseUrl: string; apiKey: string; model: string })
      .then(result => setStatus({ connected: result?.success ?? false, error: result?.error }))
      .catch(err => setStatus({ connected: false, error: err.message }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <span className="ai-status loading">⏳ 检测中...</span>;

  if (!status?.connected) {
    return (
      <span className="ai-status error" title={status?.error}>
        ❌ AI未连接
      </span>
    );
  }

  return (
    <span className="ai-status success">
      ✅ AI已连接
    </span>
  );
}
