import { useState, useEffect } from 'react';
import type { Account } from './types';
import Overview from './pages/Overview';
import ContentManagement from './pages/ContentManagement';
import AICreation from './pages/AICreation';
import ScheduledPublish from './pages/ScheduledPublish';
import DataInsights from './pages/DataInsights';
import AccountManagement from './pages/AccountManagement';
import SelectorSettings from './pages/SelectorSettings';
import Settings from './pages/Settings';

type Page = 'overview' | 'content' | 'ai' | 'schedule' | 'insights' | 'accounts' | 'selectors' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('overview');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.electronAPI?.getVersion().then(setVersion);
    loadAccounts();

    // 监听账号变化
    window.electronAPI?.onAccountAdded((account) => {
      setAccounts(prev => [account, ...prev]);
    });

    window.electronAPI?.onAccountRemoved(({ accountId }) => {
      setAccounts(prev => prev.filter(a => a.id !== accountId));
    });

    return () => {
      window.electronAPI?.removeAllListeners('account:added');
      window.electronAPI?.removeAllListeners('account:removed');
    };
  }, []);

  const loadAccounts = async () => {
    try {
      const list = await window.electronAPI?.listAccounts();
      setAccounts(list || []);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      setAccounts([]);
    }
  };

  const navItems: { page: Page; icon: string; label: string }[] = [
    { page: 'overview', icon: '📊', label: '概览' },
    { page: 'content', icon: '📝', label: '内容管理' },
    { page: 'ai', icon: '🤖', label: 'AI 创作' },
    { page: 'schedule', icon: '📅', label: '定时发布' },
    { page: 'insights', icon: '📈', label: '数据洞察' },
    { page: 'accounts', icon: '🔑', label: '账号管理' },
    { page: 'selectors', icon: '🎯', label: '选择器设置' },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <Overview />;
      case 'content':
        return <ContentManagement />;
      case 'ai':
        return <AICreation />;
      case 'schedule':
        return <ScheduledPublish />;
      case 'insights':
        return <DataInsights />;
      case 'accounts':
        return <AccountManagement />;
      case 'selectors':
        return <SelectorSettings />;
      case 'settings':
        return <Settings />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="app-layout">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div style={{
          padding: 'var(--space-lg)',
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)'
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary), var(--accent-orange))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}>
              🚀
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
                MatrixHub
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {version && `v${version}`}
              </p>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: 'var(--space-sm)' }}>
          {navItems.map(({ page, icon, label }) => (
            <NavItem
              key={page}
              icon={icon}
              label={label}
              active={currentPage === page}
              onClick={() => setCurrentPage(page)}
            />
          ))}
        </nav>

        <div style={{
          padding: 'var(--space-md)',
          borderTop: '1px solid var(--border-subtle)'
        }}>
          <NavItem
            icon="⚙️"
            label="设置"
            active={currentPage === 'settings'}
            onClick={() => setCurrentPage('settings')}
          />
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main-content">
        <header className="header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {navItems.find(n => n.page === currentPage)?.label ?? '设置'}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {accounts.length > 0 && (
              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                {accounts.slice(0, 3).map(account => (
                  <span
                    key={account.id}
                    className={`badge badge-platform-${account.platform}`}
                    style={{ fontSize: 11 }}
                  >
                    {account.platform === 'douyin' ? '抖音' :
                     account.platform === 'kuaishou' ? '快手' : '小红书'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="content-area" style={{ padding: 'var(--space-xl)' }}>
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) var(--space-md)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: active ? 'var(--bg-elevated)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 14,
        marginBottom: 'var(--space-2xs)',
        transition: 'all 150ms ease',
        border: active ? '1px solid var(--border-subtle)' : '1px solid transparent',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

export default App;
