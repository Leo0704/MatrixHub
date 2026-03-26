interface GenerateButtonProps {
  generating: boolean;
  disabled: boolean;
  contentMode: 'text' | 'image' | 'voice' | 'video';
  onClick: () => void;
}

export function GenerateButton({ generating, disabled, onClick }: GenerateButtonProps) {
  return (
    <button
      className="btn btn-primary"
      style={{ width: '100%', fontSize: 13 }}
      disabled={disabled || generating}
      onClick={onClick}
    >
      {generating ? (
        <>
          <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          生成中...
        </>
      ) : (
        <>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          开始生成
        </>
      )}
    </button>
  );
}
