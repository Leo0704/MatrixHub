import { useEffect, useState, useRef } from 'react';
import { useAppStore, type Page } from './stores/appStore';
import { ToastProvider } from './components/Toast';
import { OnboardingGuide } from './components/OnboardingGuide';
import { AIRecommendationModal, type AIRecommendation, type TaskParams } from './components/AIRecommendationModal';
import { NotificationModal } from './components/NotificationModal';
import type { NotificationMustData, NotificationImportantData } from '~shared/ipc-api';
import type { TaskType, Platform } from '~shared/types';
import { ErrorBoundary } from './components/ErrorBoundary';
import DataInsights from './pages/DataInsights';
import AccountManagement from './pages/AccountManagement';
import Settings from './pages/Settings';
import { CampaignLaunch } from './pages/CampaignLaunch';
import { CampaignDashboard } from './pages/CampaignDashboard';
import { CampaignReportPage } from './pages/CampaignReport';

function App() {
  const { accounts, setAccounts, addAccount, removeAccount, version, setVersion, currentPage, setCurrentPage, setHasCompletedOnboarding, initTaskDraft } = useAppStore();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [aiRecommendation, setAIRecommendation] = useState<AIRecommendation | null>(null);
  const [notificationMust, setNotificationMust] = useState<NotificationMustData | null>(null);
  const [notificationImportant, setNotificationImportant] = useState<NotificationImportantData | null>(null);
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

    // 通知监听
    window.electronAPI?.onNotificationMust((data) => {
      setNotificationMust(data);
    });

    window.electronAPI?.onNotificationImportant((data) => {
      setNotificationImportant(data);
    });

    return () => {
      window.electronAPI?.removeAllListeners('account:added');
      window.electronAPI?.removeAllListeners('account:removed');
      window.electronAPI?.removeAllListeners('ai:recommendation');
      window.electronAPI?.removeAllListeners('notification:must');
      window.electronAPI?.removeAllListeners('notification:important');
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
    { page: 'settings', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/></svg>, label: 'AI 配置' },
    { page: 'accounts', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: '账号管理' },
    { page: 'campaignLaunch', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>, label: '推广中心' },
    { page: 'campaignDashboard', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>, label: '推广列表' },
    { page: 'campaignReport', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, label: '效果报告' },
    { page: 'insights', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>, label: '数据报表' },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'insights':
        return <DataInsights />;
      case 'accounts':
        return <AccountManagement />;
      case 'campaignLaunch':
        return <CampaignLaunch />;
      case 'campaignDashboard':
        return <CampaignDashboard />;
      case 'campaignReport':
        return <CampaignReportPage />;
      case 'settings':
        return <Settings />;
      default:
        return <AccountManagement />;
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
    {notificationMust && (
      <NotificationModal
        must={notificationMust}
        onAcknowledge={() => setNotificationMust(null)}
        onDismiss={() => setNotificationMust(null)}
      />
    )}
    {notificationImportant && (
      <NotificationModal
        important={notificationImportant}
        onDismiss={() => setNotificationImportant(null)}
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
                      {account.platform === 'douyin' ? '抖音' : '抖音'}
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
