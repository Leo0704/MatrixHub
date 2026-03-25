import { useEffect, useRef, useState } from 'react';
import type { Platform, DailyPlan, HotTopicDecision } from '~shared/types';
import './AIRecommendationModal.css';

export interface TaskParams {
  type: string;
  platform: Platform;
  title: string;
  payload: Record<string, unknown>;
  scheduledAt?: number;
}

export interface AIRecommendation {
  action: string;
  reason: string;
  confidence: number;
  params: {
    platform?: Platform;
    result?: unknown;
    tasks?: TaskParams[];
    task?: TaskParams;
  };
}

export interface AIRecommendationModalProps {
  recommendation: AIRecommendation;
  onAccept: (tasks: TaskParams[]) => void;
  onIgnore: () => void;
}

export function AIRecommendationModal({
  recommendation,
  onAccept,
  onIgnore,
}: AIRecommendationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());

  useEffect(() => {
    // 默认选中所有任务
    if (recommendation.params.tasks) {
      setSelectedTasks(new Set(recommendation.params.tasks.map((_, i) => i)));
    } else if (recommendation.params.task) {
      setSelectedTasks(new Set([0]));
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onIgnore();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onIgnore, recommendation]);

  const tasks = recommendation.params.tasks || (recommendation.params.task ? [recommendation.params.task] : []);
  const confidencePercent = (recommendation.confidence * 100).toFixed(0);
  const isDailyBriefing = recommendation.action === 'daily_briefing';
  const isHotTopic = recommendation.action === 'hot_topic';

  const platformNames: Record<Platform, string> = {
    douyin: '抖音',
    kuaishou: '快手',
    xiaohongshu: '小红书',
  };

  const formatScheduledTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleTask = (index: number) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTasks(newSelected);
  };

  const handleAccept = () => {
    const selected = tasks.filter((_, i) => selectedTasks.has(i));
    onAccept(selected);
  };

  const getRecommendationDetails = () => {
    if (isDailyBriefing && recommendation.params.result) {
      const plan = recommendation.params.result as DailyPlan;
      return {
        title: '每日内容推荐',
        topics: plan.recommendedTopics || [],
        bestTimes: plan.bestTimes || [9],
        warnings: plan.warnings || [],
      };
    }
    if (isHotTopic && recommendation.params.result) {
      const decision = recommendation.params.result as HotTopicDecision;
      return {
        title: '热点追踪推荐',
        topics: [decision.topic],
        contentAngle: decision.contentAngle,
        reason: decision.reason,
      };
    }
    return null;
  };

  const details = getRecommendationDetails();

  return (
    <div className="ai-recommendation-overlay" onClick={onIgnore}>
      <div
        ref={modalRef}
        className="ai-recommendation-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="ai-recommendation-header">
          <div className="ai-recommendation-icon">🤖</div>
          <div>
            <h3>{details?.title || 'AI 推荐'}</h3>
            <div className="ai-confidence">
              <span className="ai-confidence-label">置信度</span>
              <span className={`ai-confidence-value ${recommendation.confidence >= 0.8 ? 'high' : recommendation.confidence >= 0.6 ? 'medium' : 'low'}`}>
                {confidencePercent}%
              </span>
            </div>
          </div>
        </div>

        <div className="ai-recommendation-reason">
          {recommendation.reason}
        </div>

        {isDailyBriefing && details && (
          <div className="ai-recommendation-content">
            {details.topics.length > 0 && (
              <div className="ai-topics">
                <div className="ai-section-label">推荐话题</div>
                <div className="ai-topic-list">
                  {details.topics.map((topic, i) => (
                    <span key={i} className="ai-topic-tag">{topic}</span>
                  ))}
                </div>
              </div>
            )}
            {details.bestTimes && details.bestTimes.length > 0 && (
              <div className="ai-times">
                <div className="ai-section-label">最佳发布时间</div>
                <div className="ai-time-list">
                  {details.bestTimes.map((hour, i) => (
                    <span key={i} className="ai-time-tag">{hour}:00</span>
                  ))}
                </div>
              </div>
            )}
            {details.warnings && details.warnings.length > 0 && (
              <div className="ai-warnings">
                <div className="ai-section-label">注意事项</div>
                {details.warnings.map((warning, i) => (
                  <div key={i} className="ai-warning-item">⚠️ {warning}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {isHotTopic && details && (
          <div className="ai-recommendation-content">
            <div className="ai-hot-topic-info">
              <div className="ai-section-label">热点话题</div>
              <div className="ai-hot-topic-title">#{details.topics[0]}#</div>
            </div>
            {details.contentAngle && (
              <div className="ai-content-angle">
                <div className="ai-section-label">内容角度</div>
                <div className="ai-angle-text">{details.contentAngle}</div>
              </div>
            )}
          </div>
        )}

        <div className="ai-tasks-section">
          <div className="ai-section-label">
            {isDailyBriefing ? '待创建任务' : '任务预览'}
            <span className="ai-task-count">({selectedTasks.size}/{tasks.length})</span>
          </div>
          <div className="ai-task-list">
            {tasks.map((task, i) => (
              <div
                key={i}
                className={`ai-task-item ${selectedTasks.has(i) ? 'selected' : ''}`}
                onClick={() => toggleTask(i)}
              >
                <div className="ai-task-checkbox">
                  {selectedTasks.has(i) ? '✓' : ''}
                </div>
                <div className="ai-task-info">
                  <div className="ai-task-title">{task.title}</div>
                  <div className="ai-task-meta">
                    <span className={`badge badge-platform-${task.platform}`}>
                      {platformNames[task.platform]}
                    </span>
                    {task.scheduledAt && (
                      <span className="ai-task-time">
                        📅 {formatScheduledTime(task.scheduledAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ai-recommendation-actions">
          <button className="btn btn-secondary" onClick={onIgnore}>
            忽略
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={selectedTasks.size === 0}
          >
            创建任务 ({selectedTasks.size})
          </button>
        </div>
      </div>
    </div>
  );
}
