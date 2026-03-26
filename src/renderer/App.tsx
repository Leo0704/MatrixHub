import { useEffect, useState, useRef } from 'react';
import { useAppStore, type Page } from './stores/appStore';
import { ToastProvider } from './components/Toast';
import { OnboardingGuide } from './components/OnboardingGuide';
import { AIRecommendationModal, type AIRecommendation, type TaskParams } from './components/AIRecommendationModal';
import type { TaskType, Platform } from '~shared/types';
import { ErrorBoundary } from './components/ErrorBoundary';
import Overview from './pages/Overview';
import ContentManagement from './pages/ContentManagement';
import AICreation from './pages/AICreation';
import ScheduledPublish from './pages/ScheduledPublish';
import DataInsights from './pages/DataInsights';
import AccountManagement from './pages/AccountManagement';
import Settings from './pages/Settings';
import AutoCreation from './pages/AutoCreation';

function App() {
  const { accounts, setAccounts, addAccount, removeAccount, version, setVersion, currentPage, setCurrentPage, setHasCompletedOnboarding, initTaskDraft } = useAppStore();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [aiRecommendation, setAIRecommendation] = useState<AIRecommendation | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      // Load version
      window.electronAPI?.getVersion().then(setVersion);

      // Load accounts first
      try {
        const list = await window.electronAPI?.listAccounts();
        setAccounts(list || []);
      } catch (error) {
        console.error('Failed to load accounts:', error);
        setAccounts([]);
      }

      // Initialize task draft from encrypted storage
      try {
        await initTaskDraft();
      } catch (error) {
        console.error('Failed to initialize task draft:', error);
      }

      // Then check if onboarding is needed
      const completed = localStorage.getItem('onboardingCompleted') === 'true';
      if (!completed) {
        const needsConsent = await window.electronAPI?.getConsentRequired();
        if (needsConsent) {
          setShowOnboarding(true);
        }
      }
    };

    init();

    window.electronAPI?.onAccountAdded((account) => {
      addAccount(account);
    });

    window.electronAPI?.onAccountRemoved(({ accountId }) => {
      removeAccount(accountId);
    });

    // AI 推荐监听
    window.electronAPI?.onAIRecommendation((data) => {
      // 只显示需要用户确认的推荐（包含 tasks 或 task）
      if ((data.params.tasks && data.params.tasks.length > 0) || data.params.task) {
        setAIRecommendation(data);
      }
    });

    return () => {
      window.electronAPI?.removeAllListeners('account:added');
      window.electronAPI?.removeAllListeners('account:removed');
      window.electronAPI?.removeAllListeners('ai:recommendation');
    };
  }, [addAccount, removeAccount, setAccounts, setVersion, initTaskDraft]);

  const handleAIRecommendationAccept = async (tasks: TaskParams[]) => {
    try {
      for (const task of tasks) {
        await window.electronAPI?.createTask({ ...task, type: task.type as TaskType, platform: task.platform as Platform });
      }
      setAIRecommendation(null);
    } catch (error) {
      console.error('Failed to create tasks from recommendation:', error);
    }
  };

  const handleAIRecommendationIgnore = () => {
    setAIRecommendation(null);
  };

  const navItems: { page: Page; icon: React.ReactNode; label: string }[] = [
    { page: 'overview', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>, label: '概览' },
    { page: 'content', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>, label: '内容管理' },
    { page: 'ai', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8V4H8"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M12 16v4h4"/><path d="M4 12h4"/><path d="M16 12h4"/></svg>, label: 'AI 创作' },
    { page: 'schedule', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: '定时发布' },
    { page: 'insights', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>, label: '数据洞察' },
    { page: 'accounts', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>, label: '账号管理' },
    { page: 'auto-creation', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, label: '全自动创作' },
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
      case 'auto-creation':
        return <AutoCreation />;
      case 'settings':
        return <Settings />;
      default:
        return <Overview />;
    }
  };

  return (
    <ToastProvider>
    {showOnboarding && (
      <OnboardingGuide onComplete={() => {
        window.electronAPI?.grantConsent();
        setShowOnboarding(false);
        setHasCompletedOnboarding(true);
      }} />
    )}
    {aiRecommendation && (
      <AIRecommendationModal
        recommendation={aiRecommendation}
        onAccept={handleAIRecommendationAccept}
        onIgnore={handleAIRecommendationIgnore}
      />
    )}
    <div className="app-layout">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div style={{
          padding: 'var(--space-lg) var(--space-xl)',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 'var(--space-xs)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary) 0%, #7c5df0 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(91, 141, 239, 0.3)',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                MatrixHub
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {version && `v${version}`}
              </p>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: 'var(--space-sm)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}
            label="设置"
            active={currentPage === 'settings'}
            onClick={() => setCurrentPage('settings')}
          />
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main-content" style={{
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle ambient gradient */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '60%',
          height: '40%',
          background: 'radial-gradient(ellipse at top right, rgba(129, 140, 248, 0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <header className="header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              {/* Breadcrumb dot */}
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--primary)',
                boxShadow: '0 0 6px var(--primary)',
                animation: 'pulse 2s ease-in-out infinite',
              }} />
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                fontFamily: 'var(--font-display)',
                letterSpacing: '-0.01em',
              }}>
                {navItems.find(n => n.page === currentPage)?.label ?? '设置'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              {accounts.length > 0 && (
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                  {accounts.slice(0, 3).map(account => (
                    <span
                      key={account.id}
                      className={`badge badge-platform-${account.platform}`}
                      style={{ fontSize: 10 }}
                    >
                      {account.platform === 'douyin' ? '抖音' :
                       account.platform === 'kuaishou' ? '快手' : '小红书'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </header>

          <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="content-area" style={{ flex: 1, padding: 'var(--space-xl)', overflow: 'auto' }}>
              <ErrorBoundary>{renderPage()}</ErrorBoundary>
            </div>
          </div>
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: '9px var(--space-md)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: active ? 'var(--bg-elevated)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 13.5,
        fontWeight: active ? 500 : 400,
        transition: 'all 180ms var(--ease-out)',
        border: '1px solid transparent',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bg-elevated)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }
      }}
    >
      {/* Active indicator bar */}
      {active && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3,
          height: 18,
          borderRadius: '0 2px 2px 0',
          background: 'var(--primary)',
          boxShadow: '0 0 8px var(--primary-glow)',
        }} />
      )}
      <span aria-hidden="true" style={{ fontSize: 16, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default App;
