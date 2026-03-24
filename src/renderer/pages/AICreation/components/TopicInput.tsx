interface TopicInputProps {
  topic: string;
  onChange: (topic: string) => void;
}

export function TopicInput({ topic, onChange }: TopicInputProps) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <label style={labelStyle}>创作主题</label>
      <textarea
        className="input"
        style={{
          width: '100%',
          height: 100,
          padding: 'var(--space-md)',
          resize: 'none',
        }}
        placeholder="输入你想要创作的主题..."
        value={topic}
        onChange={e => onChange(e.target.value)}
      />
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
