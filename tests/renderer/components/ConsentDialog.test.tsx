import { render, screen, fireEvent } from '@testing-library/react';
import { ConsentDialog } from '../../../src/renderer/components/ConsentDialog';

describe('ConsentDialog', () => {
  it('renders TOS content and requires acknowledgment', () => {
    const onAccept = vi.fn();
    render(<ConsentDialog onAccept={onAccept} />);

    expect(screen.getByText(/自动化操作你的账号，可能违反平台服务条款/)).toBeInTheDocument();
    expect(screen.getByText(/账号可能被封禁/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我已阅读并同意' })).toBeDisabled();
  });

  it('enables accept button only when checkbox is checked', () => {
    const onAccept = vi.fn();
    render(<ConsentDialog onAccept={onAccept} />);

    const checkbox = screen.getByRole('checkbox');
    const button = screen.getByRole('button', { name: '我已阅读并同意' });

    expect(button).toBeDisabled();
    fireEvent.click(checkbox);
    expect(button).toBeEnabled();
  });
});
