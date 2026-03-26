// Icons for empty states and buttons
const Icons = {
  copy: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  check: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  edit: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  ),
  upload: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  download: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  undo: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
  ),
  text: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8"/>
      <rect x="8" y="8" width="8" height="8" rx="1"/>
      <path d="M12 16v4h4"/>
      <path d="M4 12h4"/>
      <path d="M16 12h4"/>
    </svg>
  ),
  image: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  voice: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
  video: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  ),
};

interface ContentPreviewProps {
  contentMode: 'text' | 'image' | 'voice' | 'video';
  result: string | null;
  imageResult: { url: string; revisedPrompt?: string } | null;
  voiceResult: string | null;
  videoResult: string | null;
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
  onUndo?: () => void;
  canUndo?: boolean;
}

export function ContentPreview({
  contentMode,
  result,
  imageResult,
  voiceResult,
  videoResult,
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
  onUndo,
  canUndo,
}: ContentPreviewProps) {
  const hasResult = result || imageResult || voiceResult || videoResult;

  const emptyIcon = {
    text: Icons.text,
    image: Icons.image,
    voice: Icons.voice,
    video: Icons.video,
  }[contentMode];

  const loadingText = {
    text: 'AI 正在创作中，请稍候...',
    image: 'AI 正在生成图片...',
    voice: 'AI 正在生成语音...',
    video: 'AI 正在生成视频...',
  }[contentMode];

  return (
    <div className="card animate-fade-in" style={{ height: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-lg)',
      }}>
        <h3>生成结果</h3>
        {hasResult && (
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {canUndo && onUndo && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, gap: 5, padding: '0 var(--space-sm)' }}
                onClick={onUndo}
                title="撤销 (Ctrl+Z)"
              >
                {Icons.undo}
                撤销
              </button>
            )}
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, gap: 5, padding: '0 var(--space-sm)' }}
              onClick={onCopy}
              aria-label={copied ? '已复制' : '复制'}
            >
              {copied ? Icons.check : Icons.copy}
              {copied ? '已复制' : '复制'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, gap: 5, padding: '0 var(--space-sm)' }}
              onClick={onEditToggle}
              aria-label={isEditing ? '完成编辑' : '编辑'}
            >
              {Icons.edit}
              {isEditing ? '完成' : '编辑'}
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, gap: 5, padding: '0 var(--space-md)', height: 32 }}
              onClick={onPublish}
            >
              {Icons.upload}
              发布
            </button>
          </div>
        )}
      </div>

      {/* Empty / Loading State */}
      {!hasResult && (
        <div className="empty-state" style={{ height: 300 }}>
          {generating ? (
            <>
              <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
              <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-lg)', fontSize: 13 }}>
                {loadingText}
              </p>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--text-disabled)' }}>{emptyIcon}</div>
              <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-md)', fontSize: 13 }}>
                生成结果将显示在这里
              </p>
            </>
          )}
        </div>
      )}

      {/* Image Result */}
      {contentMode === 'image' && imageResult && (
        <div style={{ animation: 'fadeInUp 0.4s var(--ease-out)' }}>
          <img
            src={imageResult.url}
            alt="Generated"
            style={{
              maxWidth: '100%',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          />
          {imageResult.revisedPrompt && (
            <p style={{ marginTop: 'var(--space-sm)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              修订描述：{imageResult.revisedPrompt}
            </p>
          )}
        </div>
      )}

      {/* Voice Result */}
      {contentMode === 'voice' && voiceResult && (
        <div style={{ animation: 'fadeInUp 0.4s var(--ease-out)' }}>
          <audio
            src={`data:audio/mp3;base64,${voiceResult}`}
            controls
            style={{ width: '100%', height: 44 }}
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
            {Icons.download}
            下载音频
          </button>
        </div>
      )}

      {/* Video Result */}
      {contentMode === 'video' && videoResult && (
        <div style={{ animation: 'fadeInUp 0.4s var(--ease-out)' }}>
          <video
            src={videoResult}
            controls
            style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}
          />
          <button
            className="btn btn-secondary"
            style={{ marginTop: 'var(--space-md)', width: '100%' }}
            onClick={() => {
              const link = document.createElement('a');
              link.href = videoResult;
              link.download = `video_${Date.now()}.mp4`;
              link.click();
            }}
          >
            {Icons.download}
            下载视频
          </button>
        </div>
      )}

      {/* Text Result */}
      {contentMode === 'text' && result && !isEditing && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          lineHeight: 1.9,
          whiteSpace: 'pre-wrap',
          color: 'var(--text-secondary)',
          animation: 'fadeInUp 0.4s var(--ease-out)',
        }}>
          {result}
        </div>
      )}

      {/* Text Editing */}
      {contentMode === 'text' && result && isEditing && (
        <textarea
          value={editedContent}
          onChange={e => onEditedContentChange(e.target.value)}
          onBlur={onEditedContentBlur}
          autoFocus
          style={{
            width: '100%',
            minHeight: 300,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.9,
            padding: 'var(--space-md)',
            background: 'var(--bg-base)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            resize: 'vertical',
          }}
        />
      )}

      {/* Iteration Buttons */}
      {contentMode === 'text' && result && !isEditing && (
        <div style={{ marginTop: 'var(--space-xl)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-lg)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', fontWeight: 500 }}>
            快速优化
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            {[
              { label: '太正式', feedback: '太正式了，改口语化' },
              { label: '太长了', feedback: '太长了，缩短一半' },
              { label: '开头弱', feedback: '不够吸引人，优化开头' },
              { label: '加梗', feedback: '再加一些梗或金句' },
            ].map(btn => (
              <button
                key={btn.label}
                className="btn btn-secondary"
                style={{ fontSize: 12, height: 28 }}
                onClick={() => onIterate(btn.feedback)}
                disabled={generating}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Iteration History */}
      {contentMode === 'text' && iterationHistory.length > 0 && (
        <div style={{
          marginTop: 'var(--space-lg)',
          padding: 'var(--space-md)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', fontWeight: 500 }}>
            迭代历史 ({iterationHistory.length} 次)
          </div>
          {iterationHistory.map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-sm)',
              marginBottom: i < iterationHistory.length - 1 ? 'var(--space-xs)' : 0,
            }}>
              <span style={{
                fontSize: 10,
                color: 'var(--primary)',
                fontWeight: 600,
                background: 'var(--primary-glow)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                flexShrink: 0,
                marginTop: 1,
              }}>
                v{i + 1}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>"{item.feedback}"</span>
              <span style={{ fontSize: 12, color: 'var(--success)' }}>→ 优化</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
