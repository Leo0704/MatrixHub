import './ConfirmModal.css';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn btn-${variant}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}