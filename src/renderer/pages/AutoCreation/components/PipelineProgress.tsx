import React from 'react';

interface PipelineStep {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

interface PipelineProgressProps {
  steps: PipelineStep[];
  currentStep: string;
  contentType?: 'image' | 'video';
}

const STEP_NAMES: Record<string, string> = {
  parse: '解析输入',
  text: '生成内容',
  voice: '生成配音',
  publish: '发布',
};

function getStepDisplayName(step: string, contentType?: 'image' | 'video'): string {
  if (step === 'text') {
    return '生成内容';  // text step now handles text + media + voice
  }
  if (step === 'voice') {
    return contentType === 'video' ? '跳过' : '生成配音';
  }
  return STEP_NAMES[step] || step;
}

export function PipelineProgress({ steps, currentStep, contentType }: PipelineProgressProps) {
  return (
    <div className="pipeline-progress">
      {steps.map((step, index) => (
        <div
          key={step.step}
          className={`progress-step ${step.status} ${currentStep === step.step ? 'current' : ''}`}
        >
          <div className="step-indicator">
            {step.status === 'completed' ? '✓' :
             step.status === 'running' ? '⟳' :
             step.status === 'failed' ? '✗' :
             step.status === 'skipped' ? '⏭' :
             index + 1}
          </div>
          <div className="step-name">{getStepDisplayName(step.step, contentType)}</div>
        </div>
      ))}
    </div>
  );
}
