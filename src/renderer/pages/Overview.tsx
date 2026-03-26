import { useState, useEffect, useRef } from 'react';
import type { Task } from '~shared/types';
import { TaskRow } from '../components/TaskRow';

// ─── Animated Counter ────────────────────────────────────────────
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const duration = 800;

  useEffect(() => {
    const target = typeof value === 'number' ? value : parseFloat(String(value)) || 0;

    const step = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, suffix]);

  return <span ref={ref}>{display.toLocaleString()}{suffix}</span>;
}

// ─── SVG Icons ───────────────────────────────────────────────────
const Icons = {
  clipboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  ),
  lightning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  checkCircle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  chart: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  arrowRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  emptyTasks: (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
    </svg>
  ),
};

// ─── Stat Card ──────────────────────────────────────────────────
interface StatItem {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  color: string;
}

function StatBlock({ item, index }: { item: StatItem; index: number }) {
  return (
    <div
      className="animate-fade-in-up"
      style={{
        animationDelay: `${index * 80}ms`,
        opacity: 0,
        animationFillMode: 'forwards',
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-xs)',
      }}>
        {/* Icon */}
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-lg)',
          background: `color-mix(in srgb, ${item.color} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${item.color} 20%, transparent)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: item.color,
          marginBottom: 'var(--space-xs)',
        }}>
          {item.icon}
        </div>

        {/* Big number */}
        <div style={{
          fontSize: 42,
          fontWeight: 800,
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <AnimatedNumber value={item.value} suffix={item.suffix} />
        </div>

        {/* Label */}
        <div style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          fontWeight: 500,
          letterSpacing: '0.01em',
        }}>
          {item.label}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────
export default function Overview() {
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    window.electronAPI?.onTaskCreated((task) => {
      setRecentTasks(prev => [task, ...prev.slice(0, 9)]);
    });
    window.electronAPI?.onTaskUpdated((task) => {
      setRecentTasks(prev => prev.map(t => t.id === task.id ? task : t));
      loadStats();
    });
    return () => {
      window.electronAPI?.removeAllListeners('task:created');
      window.electronAPI?.removeAllListeners('task:updated');
    };
  }, []);

  const loadData = async () => {
    try {
      const [taskStats, tasks] = await Promise.all([
        window.electronAPI?.getTaskStats(),
        window.electronAPI?.listTasks({ limit: 5 }),
      ]);
      setStats(taskStats ?? null);
      setRecentTasks(tasks ?? []);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const taskStats = await window.electronAPI?.getTaskStats();
    setStats(taskStats ?? null);
  };

  const totalTasks = stats?.total ?? 0;
  const totalCompleted = stats?.completed ?? 0;
  const totalFailed = stats?.failed ?? 0;
  const totalPending = (stats?.pending ?? 0) + (stats?.running ?? 0);
  const successRate = totalCompleted + totalFailed > 0
    ? (totalCompleted / (totalCompleted + totalFailed)) * 100
    : 0;

  const statItems: StatItem[] = [
    {
      label: '总任务数',
      value: totalTasks,
      icon: Icons.clipboard,
      color: 'var(--primary)',
    },
    {
      label: '执行中',
      value: totalPending,
      icon: Icons.lightning,
      color: 'var(--accent)',
    },
    {
      label: '已完成',
      value: totalCompleted,
      icon: Icons.checkCircle,
      color: 'var(--success)',
    },
    {
      label: '成功率',
      value: Math.round(successRate * 10) / 10,
      suffix: '%',
      icon: Icons.chart,
      color: 'var(--info)',
    },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* ── Page Header ─────────────────────────────────────── */}
      <div
        className="animate-fade-in-up"
        style={{ marginBottom: 'var(--space-2xl)', opacity: 0 }}
      >
        <h1 style={{ marginBottom: 'var(--space-xs)' }}>概览</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {new Date().toLocaleDateString('zh-CN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* ── Stats Grid ─────────────────────────────────────── */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--space-xl)',
          marginBottom: 'var(--space-2xl)',
        }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card" style={{ padding: 'var(--space-xl)' }}>
              <div className="skeleton" style={{ width: 40, height: 40, marginBottom: 16, borderRadius: 'var(--radius-lg)' }} />
              <div className="skeleton" style={{ width: 80, height: 42, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: 60, height: 14 }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--space-xl)',
          marginBottom: 'var(--space-2xl)',
        }}>
          {statItems.map((item, i) => (
            <div
              key={item.label}
              className="card animate-fade-in-up"
              style={{
                padding: 'var(--space-xl)',
                animationDelay: `${i * 80}ms`,
                opacity: 0,
                animationFillMode: 'forwards',
                transition: 'transform 200ms var(--ease-out), box-shadow 200ms ease',
                cursor: 'default',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <StatBlock item={item} index={i} />
            </div>
          ))}
        </div>
      )}

      {/* ── Recent Tasks ───────────────────────────────────── */}
      <div
        className="card animate-fade-in-up"
        style={{
          animationDelay: '320ms',
          opacity: 0,
          animationFillMode: 'forwards',
          padding: 'var(--space-xl)',
        }}
      >
        {/* Section header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-lg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>最近任务</h2>
            {!loading && recentTasks.length > 0 && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                {recentTasks.length}
              </span>
            )}
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, gap: 5, color: 'var(--primary)', padding: '4px 8px' }}
          >
            查看全部 {Icons.arrowRight}
          </button>
        </div>

        {/* Task list */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        ) : recentTasks.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-3xl) 0' }}>
            <div className="empty-state-icon">{Icons.emptyTasks}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>暂无任务</p>
            <p style={{ color: 'var(--text-disabled)', fontSize: 12 }}>创建一个开始吧</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {recentTasks.map((task, i) => (
              <div
                key={task.id}
                className="animate-fade-in-up"
                style={{
                  animationDelay: `${360 + i * 50}ms`,
                  opacity: 0,
                  animationFillMode: 'forwards',
                }}
              >
                <TaskRow task={task} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
