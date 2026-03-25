interface ContentTabsProps {
  contentMode: 'text' | 'image' | 'voice' | 'video';
  onChange: (mode: 'text' | 'image' | 'voice' | 'video') => void;
}

export function ContentTabs({ contentMode, onChange }: ContentTabsProps) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <label style={labelStyle}>内容类型</label>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button
          className={`btn ${contentMode === 'text' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, fontSize: 13 }}
          onClick={() => onChange('text')}
        >
          📝 文案
        </button>
        <button
          className={`btn ${contentMode === 'image' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, fontSize: 13 }}
          onClick={() => onChange('image')}
        >
          🖼️ 图片
        </button>
        <button
          className={`btn ${contentMode === 'voice' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, fontSize: 13 }}
          onClick={() => onChange('voice')}
        >
          🔊 语音
        </button>
        <button
          className={`btn ${contentMode === 'video' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, fontSize: 13 }}
          onClick={() => onChange('video')}
        >
          🎬 视频
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)'
};
