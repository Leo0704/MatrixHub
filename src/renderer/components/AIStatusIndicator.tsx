import { useState, useEffect } from 'react';
import './AIStatusIndicator.css';

interface AIStatus {
  connected: boolean;
  provider?: string;
  error?: string;
}

const StatusIcon = ({ connected, loading }: { connected: boolean; loading: boolean }) => {
  if (loading) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ai-status-spinner">
        <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75"/>
      </svg>
    );
  }
  if (connected) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
};

export function AIStatusIndicator() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI?.testAIConnection({} as { baseUrl: string; apiKey: string; model: string })
      .then(result => setStatus({ connected: result?.success ?? false, error: result?.error }))
      .catch(err => setStatus({ connected: false, error: err.message }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <span className="ai-status loading">
        <StatusIcon connected={false} loading={true} />
        检测中...
      </span>
    );
  }

  if (!status?.connected) {
    return (
      <span className="ai-status error" title={status?.error}>
        <StatusIcon connected={false} loading={false} />
        AI未连接
      </span>
    );
  }

  return (
    <span className="ai-status success">
      <StatusIcon connected={true} loading={false} />
      AI已连接
    </span>
  );
}
