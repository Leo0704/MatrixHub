interface ContentPreviewProps {
  contentMode: 'text' | 'image' | 'voice';
  result: string | null;
  imageResult: { url: string; revisedPrompt?: string } | null;
  voiceResult: string | null;
  generating: boolean;
  copied: boolean;
  isEditing: boolean;
  editedContent: string;
  iterationHistory: { feedback: string; response: string }[];
  onCopy: () => void;
  onEditToggle: () => void;
  onEditedContentChange: (content: string) => void;
  onEditedContentBlur: () => void;
  onPublish: () => void;
  onIterate: (feedback: string) => void;
}

export function ContentPreview({
  contentMode,
  result,
  imageResult,
  voiceResult,
  generating,
  copied,
  isEditing,
  editedContent,
  iterationHistory,
  onCopy,
  onEditToggle,
  onEditedContentChange,
  onEditedContentBlur,
  onPublish,
  onIterate,
}: ContentPreviewProps) {
  const hasResult = result || imageResult || voiceResult;

  return (
    <div className="card" style={{ height: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-lg)'
      }}>
        <h3>生成结果</h3>
        {hasResult && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={onCopy}
            >
              {copied ? '✓ 已复制' : '复制'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={onEditToggle}
            >
              {isEditing ? '✓ 完成编辑' : '编辑'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={onPublish}
            >
              一键发布
            </button>
          </div>
        )}
      </div>

      {/* 根据 contentMode 显示不同的结果 */}
      {contentMode === 'image' ? (
        !imageResult ? (
          <div className="empty-state" style={{ height: 300 }}>
            <div style={{ fontSize: 48, opacity: 0.5 }}>🖼️</div>
            <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-md)' }}>
              {generating ? 'AI 正在生成图片...' : '生成的图片将显示在这里'}
            </p>
          </div>
        ) : (
          <div>
            <img
              src={imageResult.url}
              alt="Generated"
              style={{ maxWidth: '100%', borderRadius: 'var(--radius)' }}
            />
            {imageResult.revisedPrompt && (
              <p style={{ marginTop: 'var(--space-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
                修订后的描述：{imageResult.revisedPrompt}
              </p>
            )}
          </div>
        )
      ) : contentMode === 'voice' ? (
        !voiceResult ? (
          <div className="empty-state" style={{ height: 300 }}>
            <div style={{ fontSize: 48, opacity: 0.5 }}>🔊</div>
            <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-md)' }}>
              {generating ? 'AI 正在生成语音...' : '生成的语音将显示在这里'}
            </p>
          </div>
        ) : (
          <div>
            <audio
              src={`data:audio/mp3;base64,${voiceResult}`}
              controls
              style={{ width: '100%' }}
            />
            <button
              className="btn btn-secondary"
              style={{ marginTop: 'var(--space-md)', width: '100%' }}
              onClick={() => {
                const link = document.createElement('a');
                link.href = `data:audio/mp3;base64,${voiceResult}`;
                link.download = `voice_${Date.now()}.mp3`;
                link.click();
              }}
            >
              下载音频
            </button>
          </div>
        )
      ) : (
        !result ? (
          <div className="empty-state" style={{ height: 300 }}>
            <div style={{ fontSize: 48, opacity: 0.5 }}>🤖</div>
            <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-md)' }}>
              {generating ? 'AI 正在创作中，请稍候...' : '生成结果将显示在这里'}
            </p>
            {generating && (
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 'var(--space-xs)' }}>
                根据主题复杂度，可能需要 5-30 秒
              </p>
            )}
          </div>
        ) : isEditing ? (
          <textarea
            value={editedContent}
            onChange={e => onEditedContentChange(e.target.value)}
            onBlur={onEditedContentBlur}
            style={{
              width: '100%',
              minHeight: 300,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.8,
              padding: 'var(--space-md)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              resize: 'vertical'
            }}
          />
        ) : (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)'
          }}>
            {result}
          </div>
        )
      )}

      {/* 迭代优化按钮 - 仅文本模式 */}
      {contentMode === 'text' && result && !isEditing && (
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
            快速优化：
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => onIterate('太正式了，改口语化')}
              disabled={generating}
            >
              太正式
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => onIterate('太长了，缩短一半')}
              disabled={generating}
            >
              太长了
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => onIterate('不够吸引人，优化开头')}
              disabled={generating}
            >
              开头弱
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => onIterate('再加一些梗或金句')}
              disabled={generating}
            >
              加梗
            </button>
          </div>
        </div>
      )}

      {/* 迭代历史 - 仅文本模式 */}
      {contentMode === 'text' && iterationHistory.length > 0 && (
        <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
            迭代历史
          </div>
          {iterationHistory.map((item, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 'var(--space-xs)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>"{item.feedback}"</span>
              {' → '}
              <span style={{ color: 'var(--success)' }}>已优化</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
