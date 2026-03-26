import { useEffect, useRef } from 'react';
import type { NotificationMustData, NotificationImportantData } from '~shared/ipc-api';
import './NotificationModal.css';

interface NotificationModalProps {
  must?: NotificationMustData | null;
  important?: NotificationImportantData | null;
  onAcknowledge?: () => void;
  onDismiss?: () => void;
}

export function NotificationModal({
  must,
  important,
  onAcknowledge,
  onDismiss,
}: NotificationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const isMust = !!must;
  const data = must || important;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isMust) {
        onDismiss?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMust, onDismiss]);

  const handleOverlayClick = () => {
    if (!isMust) {
      onDismiss?.();
    }
  };

  const getIcon = () => {
    if (isMust) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="notification-icon notification-icon-must">
          <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="notification-icon notification-icon-important">
        <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  };

  const getTypeLabel = () => {
    if (!data) return '';
    const labels: Record<string, string> = {
      account_banned: '账号封禁',
      account_limited: '账号限流',
      content_violated: '内容违规',
      core_pitch_changed: '营销策略变更',
      frequency_increased: '发布频率调整',
      product_url_changed: '产品链接变更',
      content_type_changed: '内容类型变更',
      content_exploded: '内容爆量',
      ai_strategy_changed: 'AI换策略',
      report_ready: '效果报告',
      publish_complete: '发布完成',
    };
    return labels[data.type] || data.type;
  };

  if (!data) return null;

  return (
    <div className="notification-overlay" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className={`notification-modal ${isMust ? 'notification-must' : 'notification-important'}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="notification-header">
          {getIcon()}
          <div className="notification-title-area">
            <span className={`notification-type-badge ${isMust ? 'badge-must' : 'badge-important'}`}>
              {getTypeLabel()}
            </span>
            <h3>{data.title}</h3>
          </div>
        </div>

        <div className="notification-message">
          {data.message}
        </div>

        {data.accounts && data.accounts.length > 0 && (
          <div className="notification-accounts">
            <span className="notification-accounts-label">受影响账号：</span>
            <span className="notification-accounts-list">
              {data.accounts.join(', ')}
            </span>
          </div>
        )}

        <div className="notification-actions">
          {isMust ? (
            <button
              className="btn btn-primary"
              onClick={onAcknowledge}
            >
              我知道了
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={onDismiss}
            >
              知道了
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
