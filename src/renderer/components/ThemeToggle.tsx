import { useState, useEffect } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    window.electronAPI.getSettings().then(settings => {
      if (settings.theme) {
        setTheme(settings.theme as 'dark' | 'light');
        document.documentElement.dataset.theme = settings.theme as string;
      }
    });
  }, []);

  const toggle = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
    await window.electronAPI.saveSettings({ theme: newTheme });
  };

  return (
    <button
      className="btn btn-secondary theme-toggle"
      onClick={toggle}
      title={`当前: ${theme === 'dark' ? '深色' : '浅色'}模式，点击切换`}
    >
      {theme === 'dark' ? '🌙' : '☀️'} {theme === 'dark' ? '深色' : '浅色'}
    </button>
  );
}
