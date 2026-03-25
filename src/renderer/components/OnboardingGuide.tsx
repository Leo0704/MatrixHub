import { useState } from 'react';
import './OnboardingGuide.css';

interface OnboardingGuideProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: '👤',
    title: '添加平台账号',
    description: '首先添加你要管理的平台账号。点击左侧菜单的"账号管理"，然后点击"添加账号"按钮。',
    cta: '去添加账号',
  },
  {
    icon: '🔑',
    title: '配置AI服务（可选）',
    description: '如需AI内容生成功能，需要配置AI API。前往"设置"页面，填写AI服务商信息。',
    cta: '去设置',
  },
  {
    icon: '📝',
    title: '创建第一个任务',
    description: '在"内容管理"页面创建发布任务，选择账号、填写内容、设置发布时间。',
    cta: '去创建任务',
  },
  {
    icon: '✅',
    title: '开始使用',
    description: '你已经完成设置！如有疑问，点击右上角帮助按钮查看常见问题。',
    cta: '开始使用',
  },
];

export function OnboardingGuide({ onComplete }: OnboardingGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const step = STEPS[currentStep];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`progress-dot ${i <= currentStep ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-icon">{step.icon}</div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>

        <div className="onboarding-actions">
          <button className="btn btn-secondary" onClick={onComplete}>
            跳过引导
          </button>
          <button className="btn btn-primary" onClick={handleNext}>
            {currentStep < STEPS.length - 1 ? '下一步' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
