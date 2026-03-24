const PROMPT_TEMPLATES = [
  { id: '1', name: '短视频脚本', desc: '生成吸引人的短视频文案脚本' },
  { id: '2', name: '种草文案', desc: '生成小红书风格种草推荐文案' },
  { id: '3', name: '产品测评', desc: '生成真实体验感测评文案' },
  { id: '4', name: '话题讨论', desc: '生成能引发讨论的互动话题' },
  { id: '5', name: '知识教程', desc: '生成教学类、科普类内容' },
  { id: '6', name: '热点评论', desc: '对热点事件的评论分析' },
  { id: '7', name: '故事叙事', desc: '个人经历、品牌故事分享' },
  { id: '8', name: '日常Vlog', desc: '生活方式、Vlog脚本分享' },
];

interface PromptTypeSelectorProps {
  promptType: string;
  onChange: (type: string) => void;
}

export function PromptTypeSelector({ promptType, onChange }: PromptTypeSelectorProps) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <label style={labelStyle}>创作类型</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        {PROMPT_TEMPLATES.map(t => (
          <button
            key={t.id}
            className={`btn ${promptType === t.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, justifyContent: 'flex-start', paddingLeft: 'var(--space-md)' }}
            onClick={() => onChange(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export { PROMPT_TEMPLATES };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)'
};
