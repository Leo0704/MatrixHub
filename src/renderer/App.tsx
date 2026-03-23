import { useEffect, useState } from 'react';

declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getPath: (name: string) => Promise<string>;
      onMenuAction: (channel: string, callback: () => void) => void;
    };
  }
}

function App() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    window.electronAPI?.getVersion().then(setVersion);

    window.electronAPI?.onMenuAction('menu:new-task', () => {
      console.log('新建任务');
    });

    window.electronAPI?.onMenuAction('menu:settings', () => {
      console.log('设置');
    });
  }, []);

  return (
    <div className="app-layout">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>AI矩阵运营大师</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
            {version && `v${version}`}
          </p>
        </div>
        <nav style={{ flex: 1, padding: 'var(--space-sm)' }}>
          <NavItem icon="📊" label="概览" active />
          <NavItem icon="📝" label="内容管理" />
          <NavItem icon="🤖" label="AI 创作" />
          <NavItem icon="📅" label="定时发布" />
          <NavItem icon="📈" label="数据洞察" />
          <NavItem icon="🔑" label="账号管理" />
        </nav>
        <div style={{ padding: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
          <NavItem icon="⚙️" label="设置" />
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main-content">
        <header className="header">
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>概览</span>
        </header>
        <div className="content-area">
          <WelcomeScreen />
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) var(--space-md)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: active ? 'var(--bg-elevated)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: '14px',
        marginBottom: 'var(--space-xs)',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">🚀</div>
      <h2 style={{ marginBottom: 'var(--space-sm)' }}>欢迎使用 AI矩阵运营大师</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: '400px', marginBottom: 'var(--space-xl)' }}>
        多平台内容创作与发布管理工具，支持抖音、快手、小红书
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
        <button className="btn btn-primary">新建任务</button>
        <button className="btn btn-secondary">添加账号</button>
      </div>
    </div>
  );
}

export default App;
