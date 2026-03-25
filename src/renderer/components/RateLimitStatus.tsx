import { useState, useEffect } from 'react';
import './RateLimitStatus.css';

interface RateLimitData {
  minute: { remaining: number };
  // hour/day reserved for future use
}

export function RateLimitStatus() {
  const [status, setStatus] = useState<Record<string, RateLimitData>>({});

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await window.electronAPI.getRateLimitStatusAll();
        setStatus(result);
      } catch {
        // Silently fail - rate limit status is non-critical
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const platforms = Object.keys(status);
  if (platforms.length === 0) return null;

  const MINUTE_LIMIT = 10;

  return (
    <div className="rate-limit-status">
      {platforms.map(platform => {
        const data = status[platform];
        const minutePercent = (data.minute.remaining / MINUTE_LIMIT) * 100;

        return (
          <div key={platform} className="rate-platform">
            <span className="platform-name">{platform}</span>
            <div className="rate-bar-container">
              <div className="rate-bar">
                <div className="rate-fill" style={{ width: `${minutePercent}%` }} />
              </div>
              <span className="rate-text">{data.minute.remaining}/{MINUTE_LIMIT}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}