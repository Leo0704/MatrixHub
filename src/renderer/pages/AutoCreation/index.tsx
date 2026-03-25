import React, { useState, useEffect } from 'react';
import type { Platform, Account } from '~shared/types';
import { ProductInput } from './components/ProductInput';
import { PipelineConfig } from './components/PipelineConfig';
import { PipelineProgress } from './components/PipelineProgress';
import { PipelinePreview } from './components/PipelinePreview';
import { useToast } from '../../components/Toast';
import './styles.css';

export default function AutoCreation() {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [input, setInput] = useState({ type: 'url' as const, url: '' });
  const [config, setConfig] = useState({
    contentType: 'image' as const,  // 'image' | 'video'
    imageCount: 9 as const,          // 默认 9 张图
    generateVoice: false,          // 默认不生成配音
    autoPublish: false,
    targetAccounts: [] as string[],
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pipelineTask, setPipelineTask] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const { showToast } = useToast();

  // 加载账号列表
  useEffect(() => {
    window.electronAPI?.listAccounts(platform).then((list) => {
      setAccounts(list || []);
    });
  }, [platform]);

  // 监听 pipeline 更新
  useEffect(() => {
    window.electronAPI?.onPipelineUpdated((task) => {
      setPipelineTask(task);
      if (task.status === 'completed') {
        setRunning(false);
        showToast('流水线执行完成！', 'success');
      } else if (task.status === 'failed') {
        setRunning(false);
        showToast(`执行失败: ${task.error}`, 'error');
      }
    });
  }, []);

  const handleStart = async () => {
    if (!input.url && !input.productDetail) {
      showToast('请输入产品链接或详情', 'warning');
      return;
    }

    if (config.autoPublish && config.targetAccounts.length === 0) {
      showToast('请选择至少一个发布账号', 'warning');
      return;
    }

    setRunning(true);
    try {
      const result = await window.electronAPI?.createPipeline({
        input: {
          type: input.type,
          url: input.url,
          productDetail: input.productDetail,
        },
        config: {
          contentType: config.contentType,
          imageCount: config.contentType === 'image' ? config.imageCount : undefined,
          generateVoice: config.contentType === 'image' ? config.generateVoice : undefined,
          autoPublish: config.autoPublish,
          targetAccounts: config.targetAccounts,
        },
        platform,
      });

      if (result?.success) {
        setPipelineTask(result.task);
        showToast('流水线已启动', 'success');
      } else {
        showToast(result?.error || '启动失败', 'error');
        setRunning(false);
      }
    } catch (error) {
      showToast(`启动失败: ${error}`, 'error');
      setRunning(false);
    }
  };

  return (
    <div className="auto-creation-page">
      <header>
        <h1>全自动创作</h1>
        <p className="subtitle">输入产品链接或详情，自动生成文案/图片/视频并发布</p>
      </header>

      <div className="auto-creation-layout">
        {/* 左侧：配置 */}
        <div className="config-panel">
          <div className="card">
            <h3>平台选择</h3>
            <select
              className="input"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              <option value="douyin">🎵 抖音</option>
              <option value="kuaishou">📱 快手</option>
              <option value="xiaohongshu">📕 小红书</option>
            </select>
          </div>

          <div className="card">
            <h3>产品信息</h3>
            <ProductInput value={input} onChange={setInput} />
          </div>

          <div className="card">
            <h3>生成与发布配置</h3>
            <PipelineConfig config={config} accounts={accounts} onChange={setConfig} />
          </div>

          <button
            className="btn btn-primary btn-large"
            onClick={handleStart}
            disabled={running || (!input.url && !input.productDetail)}
          >
            {running ? '执行中...' : '启动自动化创作'}
          </button>
        </div>

        {/* 右侧：进度和预览 */}
        <div className="result-panel">
          {pipelineTask ? (
            <>
              <div className="card">
                <h3>执行进度</h3>
                <PipelineProgress
                  steps={pipelineTask.steps}
                  currentStep={pipelineTask.currentStep}
                  contentType={pipelineTask.config.contentType}
                />
              </div>

              {pipelineTask.status === 'completed' && pipelineTask.result && (
                <div className="card">
                  <h3>生成结果预览</h3>
                  <PipelinePreview result={pipelineTask.result} contentType={pipelineTask.config.contentType} />
                </div>
              )}
            </>
          ) : (
            <div className="card placeholder">
              <p>配置完成后点击「启动自动化创作」</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
