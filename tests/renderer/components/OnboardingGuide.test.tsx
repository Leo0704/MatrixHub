import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingGuide } from '../../../src/renderer/components/OnboardingGuide';

describe('OnboardingGuide', () => {
  it('shows step 1 with add account CTA', () => {
    render(<OnboardingGuide onComplete={() => {}} />);
    expect(screen.getByText(/添加平台账号/)).toBeInTheDocument();
  });

  it('calls onComplete when skip is clicked', () => {
    const onComplete = vi.fn();
    render(<OnboardingGuide onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /跳过引导/ }));
    expect(onComplete).toHaveBeenCalled();
  });
});
