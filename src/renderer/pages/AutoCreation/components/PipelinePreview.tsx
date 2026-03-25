import React from 'react';

interface PipelinePreviewProps {
  result?: {
    text?: string;
    imageUrls?: string[];
    voiceBase64?: string;
    videoUrl?: string;
  };
}

export function PipelinePreview({ result, contentType }: PipelinePreviewProps & { contentType?: 'image' | 'video' }) {
  if (!result) return null;

  return (
    <div className="pipeline-preview">
      {result.text && (
        <div className="preview-text">
          <h4>文案预览</h4>
          <pre>{result.text}</pre>
        </div>
      )}

      {contentType === 'image' && result.imageUrls && result.imageUrls.length > 0 && (
        <div className="preview-image">
          <h4>图片预览 ({result.imageUrls.length}张)</h4>
          <div className="preview-images-grid">
            {result.imageUrls.map((url, i) => (
              <img key={i} src={url} alt={`生成图片 ${i + 1}`} />
            ))}
          </div>
        </div>
      )}

      {contentType === 'image' && result.voiceBase64 && (
        <div className="preview-voice">
          <h4>配音预览</h4>
          <audio src={`data:audio/mp3;base64,${result.voiceBase64}`} controls />
        </div>
      )}

      {contentType === 'video' && result.videoUrl && (
        <div className="preview-video">
          <h4>视频预览</h4>
          <video src={result.videoUrl} controls />
        </div>
      )}
    </div>
  );
}
