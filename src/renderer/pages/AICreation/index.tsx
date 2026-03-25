import { useState, useEffect, useCallback, useRef } from 'react';
import type { Platform } from '~shared/types';
import { AIStatusIndicator } from '../../components/AIStatusIndicator';
import PublishModal from '../../components/PublishModal';
import { useToast } from '../../components/Toast';
import { useAppStore } from '../../stores/appStore';

import { ContentTabs } from './components/ContentTabs';
import { PlatformSelector } from './components/PlatformSelector';
import { ModelSelector } from './components/ModelSelector';
import { PromptTypeSelector } from './components/PromptTypeSelector';
import { TopicInput } from './components/TopicInput';
import { GenerateButton } from './components/GenerateButton';
import { ContentPreview } from './components/ContentPreview';
import { AI_MODELS } from './components/ModelSelector';
import { CONTENT_PROMPTS, SYSTEM_PROMPTS } from './constants';
import { formatErrorMessage } from '../../utils/errorMessage';

// 撤销栈最大容量
const MAX_UNDO_HISTORY = 50;

// 平台上下文辅助函数
function getPlatformImageContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '这是抖音平台的图片创作。抖音用户喜欢：色彩鲜艳、视觉冲击力强、有趣好玩的画面。封面图要能在0.5秒内抓住用户眼球。',
    kuaishou: '这是快手平台的图片创作。快手用户喜欢：真实感、接地气、有故事性的画面。避免过度精致，追求自然和亲和力。',
    xiaohongshu: '这是小红书平台的图片创作。小红书用户喜欢：高颜值、精致感、有审美价值的画面。色调要高级感，排版要美观。'
  };
  return contexts[platform] || contexts.douyin;
}

function getImageSystemPrompt(platform: Platform): string {
  const prompts: Record<Platform, string> = {
    douyin: '你是一个抖音视觉创作专家，擅长生成符合抖音平台风格的图片，要求：色彩鲜艳、视觉冲击强、有趣抓眼球。',
    kuaishou: '你是一个快手视觉创作专家，擅长生成符合快手平台风格的图片，要求：真实感、接地气、有故事性。',
    xiaohongshu: '你是一个小红书视觉创作专家，擅长生成符合小红书平台风格的图片，要求：高颜值、精致感、有审美价值。'
  };
  return prompts[platform] || prompts.douyin;
}

function getVoiceContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '配音风格要求：年轻化、有活力、节奏感强。适合快节奏的短视频，内容要简洁有力。',
    kuaishou: '配音风格要求：亲切自然、接地气。像是朋友在和你聊天，不要太正式。',
    xiaohongshu: '配音风格要求：有质感、温柔亲切。像是闺蜜在分享心得，有代入感。'
  };
  return contexts[platform] || contexts.douyin;
}

function getVideoContext(platform: Platform): string {
  const contexts: Record<Platform, string> = {
    douyin: '这是抖音视频创作。抖音是一个短视频平台，内容要：1）前3秒必须有强钩子 2）节奏快，信息密集 3）结尾留悬念或强CTA 4）适合竖屏9:16格式。',
    kuaishou: '这是快手视频创作。快手用户喜欢：真实感、有故事性、接地气的内容。可以有更多时间展开，适合有温度的叙事。',
    xiaohongshu: '这是小红书视频创作。小红书视频要求：1）高颜值、精致感 2）内容有干货价值 3）适合生活方式类内容 4）竖屏或方形皆可。'
  };
  return contexts[platform] || contexts.douyin;
}

export default function AICreation() {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [model, setModel] = useState('gpt-4o');
  const [promptType, setPromptType] = useState('1');
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [iterationHistory, setIterationHistory] = useState<{feedback: string; response: string}[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [contentMode, setContentMode] = useState<'text' | 'image' | 'voice' | 'video'>('text');
  const [imageResult, setImageResult] = useState<{url: string; revisedPrompt?: string} | null>(null);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [voicePrompt, setVoicePrompt] = useState('');
  const [showPreviewConfirm, setShowPreviewConfirm] = useState(false);
  const { showToast } = useToast();
  const { hotTopicDraft, clearHotTopicDraft, setCurrentPage } = useAppStore();

  // 动态加载的 AI Provider 列表（用于 image/voice/video 模式）
  const [availableProviders, setAvailableProviders] = useState<Array<{id: string; name: string; type: string; models: string[]}>>([]);
  // image/voice/video 使用的 provider（默认用第一个已配置的）
  const [mediaProvider, setMediaProvider] = useState<{type: string; model: string}>({ type: '', model: '' });

  // 加载可用 providers
  useEffect(() => {
    window.electronAPI?.getAIProviders().then(providers => {
      setAvailableProviders(providers.filter((p: any) => p.status === 'active'));
      if (providers.length > 0) {
        const first = providers.find((p: any) => p.status === 'active');
        if (first) setMediaProvider({ type: first.type, model: first.models?.[0] || '' });
      }
    }).catch(() => {});
  }, []);

  // 检查热点话题草稿
  const prevHotTopicDraftRef = useRef<typeof hotTopicDraft>(null);

  useEffect(() => {
    // 只在 hotTopicDraft 从 null 变为有值时处理
    if (hotTopicDraft && !prevHotTopicDraftRef.current) {
      const draftTitle = hotTopicDraft.title;
      const draftPlatform = hotTopicDraft.platform as Platform;
      setTopic(draftTitle);
      setPlatform(draftPlatform);
      showToast(`已加载话题: ${draftTitle}`, 'info');
      clearHotTopicDraft();
    }
    prevHotTopicDraftRef.current = hotTopicDraft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotTopicDraft]);

  // 撤销栈
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const undoStackRef = useRef<string[]>([]);

  // 添加到撤销栈
  const pushToUndoStack = useCallback((content: string) => {
    const newStack = [...undoStackRef.current, content].slice(-MAX_UNDO_HISTORY);
    undoStackRef.current = newStack;
    setUndoStack(newStack);
  }, []);

  // 撤销操作
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const newStack = [...undoStackRef.current];
    const previousContent = newStack.pop();
    undoStackRef.current = newStack;
    setUndoStack(newStack);
    if (previousContent !== undefined) {
      setEditedContent(previousContent);
      setResult(previousContent);
    }
  }, []);

  // Ctrl+Z 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  const handlePublishSuccess = (taskIds: string[]) => {
    setShowPublishModal(false);
    showToast(`已创建 ${taskIds.length} 个发布任务`, 'success');
    // 跳转到任务列表
    setCurrentPage('content');
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败，忽略
    }
  };

  const handleIterate = async (feedback: string) => {
    if (!result) return;
    // 保存当前内容到撤销栈
    pushToUndoStack(result);
    setGenerating(true);
    try {
      const response = await window.electronAPI?.iterateAI({
        originalPrompt: CONTENT_PROMPTS[promptType]?.(topic, platform) || `主题：${topic}`,
        originalResponse: result,
        feedback,
        iterationCount: iterationHistory.length,
      });
      if (response?.success && response.content) {
        const content = response.content;
        setResult(content);
        setEditedContent(content);
        setIterationHistory(prev => [...prev, { feedback, response: content }]);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setImageResult(null);

    try {
      // 构建包含平台上下文的 prompt
      const platformContext = getPlatformImageContext(platform);
      const enhancedPrompt = `${platformContext}\n\n主题：${topic}\n\n请生成一张高质量图片，描述要详细具体，包括：\n- 画面主体和构图\n- 色彩风格\n- 氛围和情绪\n- 技术参数（如角度，光线等）`;

      const response = await window.electronAPI?.generateAI({
        taskType: 'image',
        providerType: mediaProvider.type as any,
        model: mediaProvider.model || 'dall-e-3',
        prompt: enhancedPrompt,
        system: getImageSystemPrompt(platform),
      });

      if (response?.success && response.content) {
        try {
          const data = JSON.parse(response.content);
          setImageResult(data);
          setImagePrompt(topic);
        } catch {
          setResult(`生成失败：JSON解析错误`);
        }
      } else {
        setResult(`生成失败：${response?.error || '未知错误'}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateVoice = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setVoiceResult(null);

    try {
      // 构建配音专用的内容 prompt
      const voiceContext = getVoiceContext(platform);
      const prompt = CONTENT_PROMPTS[promptType]?.(topic, platform) ||
        `主题：${topic}\n\n请将以下内容转换为语音：\n\n${voiceContext}`;

      const response = await window.electronAPI?.generateAI({
        taskType: 'voice',
        providerType: mediaProvider.type as any,
        model: mediaProvider.model || 'tts-1',
        prompt: prompt,
      });

      if (response?.success && response.content) {
        setVoiceResult(response.content);
        setVoicePrompt(topic);
      } else {
        setResult(`生成失败：${response?.error || '未知错误'}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setVideoResult(null);

    try {
      // 构建视频生成的上下文 prompt
      const videoContext = getVideoContext(platform);
      const enhancedPrompt = `${videoContext}\n\n主题：${topic}\n\n请生成视频创作描述，包括：\n1. 视频类型和风格\n2. 主要场景和镜头\n3. 节奏和转场建议\n4. 配乐风格建议`;

      const response = await window.electronAPI?.generateAI({
        taskType: 'video',
        providerType: mediaProvider.type as any,
        model: mediaProvider.model || '',
        prompt: enhancedPrompt,
      });

      if (response?.success && response.content) {
        try {
          const data = JSON.parse(response.content);
          setVideoResult(data.url || data.videoUrl || response.content);
        } catch {
          setResult(`生成失败：JSON解析错误`);
        }
      } else {
        setResult(`生成失败：${response?.error || '未知错误'}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    // 保存当前结果到撤销栈（如果有的话）
    if (result) pushToUndoStack(result);
    setGenerating(true);
    setResult(null);

    try {
      // 获取选中的模型配置
      const selectedModel = AI_MODELS[platform].find(m => m.id === model);
      if (!selectedModel) {
        setResult('错误：未找到选择的模型');
        setGenerating(false);
        return;
      }

      // 构建提示词
      const prompt = CONTENT_PROMPTS[promptType]?.(topic, platform) ||
        `主题：${topic}\n\n请生成相关内容`;
      const systemPrompt = SYSTEM_PROMPTS[platform];

      // 调用真实 AI API
      const response = await window.electronAPI?.generateAI({
        taskType: 'text',
        providerType: selectedModel.provider,
        model: model,
        prompt: prompt,
        system: systemPrompt,
        temperature: 0.7,
        maxTokens: 3000,
      });

      if (response?.success && response.content) {
        setResult(response.content);
      } else {
        const errorMsg = response?.error || '未知错误';
        setResult(`生成失败：${formatErrorMessage(errorMsg)}`);
      }
    } catch (error) {
      setResult(`生成失败：${formatErrorMessage(error instanceof Error ? error.message : '网络错误')}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateClick = () => {
    if (contentMode === 'text') handleGenerate();
    else if (contentMode === 'image') handleGenerateImage();
    else if (contentMode === 'voice') handleGenerateVoice();
    else if (contentMode === 'video') handleGenerateVideo();
  };

  return (
    <div>
      <header>
        <h1>AI 创作</h1>
        <AIStatusIndicator />
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }}>
      {/* 左侧：配置 */}
      <div>
        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>AI 创作</h3>

          <PlatformSelector platform={platform} onChange={setPlatform} />
          <ContentTabs contentMode={contentMode} onChange={setContentMode} />
          {contentMode === 'text' ? (
            <ModelSelector platform={platform} model={model} onChange={setModel} />
          ) : (
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>AI 服务商</label>
              <select
                className="input"
                value={mediaProvider.type}
                onChange={e => {
                  const p = availableProviders.find(p => p.type === e.target.value);
                  setMediaProvider({ type: e.target.value, model: p?.models?.[0] || '' });
                }}
              >
                <option value="">选择服务商...</option>
                {availableProviders.map(p => (
                  <option key={p.type} value={p.type}>
                    {p.name} ({p.models?.length || 0} 个模型)
                  </option>
                ))}
              </select>
              {mediaProvider.type && (availableProviders.find(p => p.type === mediaProvider.type)?.models?.length ?? 0) > 1 && (
                <select
                  className="input"
                  style={{ marginTop: 'var(--space-sm)' }}
                  value={mediaProvider.model}
                  onChange={e => setMediaProvider(p => ({ ...p, model: e.target.value }))}
                >
                  {availableProviders.find(p => p.type === mediaProvider.type)?.models?.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <PromptTypeSelector promptType={promptType} onChange={setPromptType} />
          <TopicInput topic={topic} onChange={setTopic} />

          <GenerateButton
            generating={generating}
            disabled={!topic.trim()}
            contentMode={contentMode}
            onClick={handleGenerateClick}
          />
        </div>

        {/* 快捷模板 */}
        <div className="card">
          <h4 style={{ marginBottom: 'var(--space-md)' }}>提示词模板</h4>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: 'var(--space-sm)' }}>
              当前的提示词模板基于最佳实践优化，
              可根据需要调整生成内容的风格和长度。
            </p>
          </div>
        </div>
      </div>

      {/* 右侧：结果 */}
      <div>
        <ContentPreview
          contentMode={contentMode}
          result={result}
          imageResult={imageResult}
          voiceResult={voiceResult}
          videoResult={videoResult}
          generating={generating}
          copied={copied}
          isEditing={isEditing}
          editedContent={editedContent}
          iterationHistory={iterationHistory}
          onCopy={handleCopy}
          onEditToggle={() => {
            setIsEditing(!isEditing);
            if (!isEditing && result) setEditedContent(result);
          }}
          onEditedContentChange={setEditedContent}
          onEditedContentBlur={() => {
            // 保存当前内容到撤销栈
            if (result) pushToUndoStack(result);
            setResult(editedContent);
            setIsEditing(false);
          }}
          onPublish={() => {
            if (!result && !imageResult && !voiceResult && !videoResult) return;
            setShowPreviewConfirm(true);
          }}
          onIterate={handleIterate}
          onUndo={handleUndo}
          canUndo={undoStack.length > 0}
        />
      </div>

      {/* 发布预览确认 */}
      {showPreviewConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }}>
          <div className="card" style={{ width: 500, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>确认发布</h3>
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                平台：{platform === 'douyin' ? '🎵 抖音' : platform === 'kuaishou' ? '📱 快手' : '📕 小红书'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                标题：{contentMode === 'image' ? imagePrompt : contentMode === 'voice' ? voicePrompt : topic}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                类型：{contentMode === 'text' ? '文本' : contentMode === 'image' ? '图片' : contentMode === 'voice' ? '语音' : '视频'}
              </div>
            </div>
            <div style={{
              marginBottom: 'var(--space-lg)',
              padding: 'var(--space-md)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius)',
              maxHeight: 200,
              overflow: 'auto',
            }}>
              {contentMode === 'image' && imageResult?.url ? (
                <img src={imageResult.url} alt="预览" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 'var(--radius)' }} />
              ) : contentMode === 'voice' && voiceResult ? (
                <audio src={`data:audio/mp3;base64,${voiceResult}`} controls style={{ width: '100%' }} />
              ) : contentMode === 'video' && videoResult ? (
                <video src={videoResult} controls style={{ width: '100%', maxHeight: 180, borderRadius: 'var(--radius)' }} />
              ) : (
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
                  {(result || '').slice(0, 500)}
                  {(result || '').length > 500 && '...'}
                </pre>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowPreviewConfirm(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={() => {
                setShowPreviewConfirm(false);
                setShowPublishModal(true);
              }}>
                确认发布
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 发布弹窗 */}
      {showPublishModal && (
        <PublishModal
          isOpen={showPublishModal}
          platform={platform}
          title={contentMode === 'image' ? imagePrompt : contentMode === 'voice' ? voicePrompt : contentMode === 'video' ? topic : topic}
          content={contentMode === 'image' && imageResult?.url ? imageResult.url : contentMode === 'voice' && voiceResult ? voiceResult : contentMode === 'video' && videoResult ? videoResult : result || ''}
          onClose={() => setShowPublishModal(false)}
          onPublished={handlePublishSuccess}
        />
      )}
      </div>
    </div>
  );
}
