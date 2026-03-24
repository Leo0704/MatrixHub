import { useState } from 'react';
import type { Platform } from '~shared/types';
import PublishModal from '../../components/PublishModal';
import { useToast } from '../../components/Toast';

import { ContentTabs } from './components/ContentTabs';
import { PlatformSelector } from './components/PlatformSelector';
import { ModelSelector } from './components/ModelSelector';
import { PromptTypeSelector } from './components/PromptTypeSelector';
import { TopicInput } from './components/TopicInput';
import { GenerateButton } from './components/GenerateButton';
import { ContentPreview } from './components/ContentPreview';
import { AI_MODELS } from './components/ModelSelector';
import { CONTENT_PROMPTS, SYSTEM_PROMPTS } from './constants';

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
  const [contentMode, setContentMode] = useState<'text' | 'image' | 'voice'>('text');
  const [imageResult, setImageResult] = useState<{url: string; revisedPrompt?: string} | null>(null);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [voicePrompt, setVoicePrompt] = useState('');
  const { showToast } = useToast();

  const handlePublishSuccess = (taskIds: string[]) => {
    setShowPublishModal(false);
    showToast(`已创建 ${taskIds.length} 个发布任务`, 'success');
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
      const selectedModel = AI_MODELS[platform].find(m => m.id === model);
      if (!selectedModel) {
        setResult('错误：未找到选择的模型');
        return;
      }

      const response = await window.electronAPI?.generateAI({
        taskType: 'image',
        providerType: selectedModel.provider,
        model: 'dall-e-3',
        prompt: topic,
      });

      if (response?.success && response.content) {
        const data = JSON.parse(response.content);
        setImageResult(data);
        setImagePrompt(topic);
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
      const selectedModel = AI_MODELS[platform].find(m => m.id === model);
      if (!selectedModel) {
        setResult('错误：未找到选择的模型');
        return;
      }

      const prompt = CONTENT_PROMPTS[promptType]?.(topic, platform) ||
        `请将以下内容转换为语音：${topic}`;

      const response = await window.electronAPI?.generateAI({
        taskType: 'voice',
        providerType: selectedModel.provider,
        model: 'tts-1',
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

  const handleGenerate = async () => {
    if (!topic.trim()) return;
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
        setResult(`生成失败：${response?.error || '未知错误'}`);
      }
    } catch (error) {
      setResult(`生成失败：${error instanceof Error ? error.message : '网络错误'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateClick = () => {
    if (contentMode === 'text') handleGenerate();
    else if (contentMode === 'image') handleGenerateImage();
    else if (contentMode === 'voice') handleGenerateVoice();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }}>
      {/* 左侧：配置 */}
      <div>
        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>AI 创作</h3>

          <PlatformSelector platform={platform} onChange={setPlatform} />
          <ContentTabs contentMode={contentMode} onChange={setContentMode} />
          <ModelSelector platform={platform} model={model} onChange={setModel} />
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
            setResult(editedContent);
            setIsEditing(false);
          }}
          onPublish={() => {
            if (!result && !imageResult && !voiceResult) return;
            setShowPublishModal(true);
          }}
          onIterate={handleIterate}
        />
      </div>

      {/* 发布弹窗 */}
      {showPublishModal && (
        <PublishModal
          isOpen={showPublishModal}
          platform={platform}
          title={contentMode === 'image' ? imagePrompt : contentMode === 'voice' ? voicePrompt : topic}
          content={contentMode === 'image' && imageResult?.url ? imageResult.url : contentMode === 'voice' && voiceResult ? voiceResult : result || ''}
          onClose={() => setShowPublishModal(false)}
          onPublished={handlePublishSuccess}
        />
      )}
    </div>
  );
}
