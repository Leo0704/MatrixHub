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
      style={{ width: '100%' }}
      disabled={disabled || generating}
      onClick={onClick}
    >
      {generating ? '🤖 生成中...' : '✨ 开始生成'}
    </button>
  );
}
