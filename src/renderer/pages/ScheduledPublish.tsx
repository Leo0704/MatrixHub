import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task, Platform, Account, TaskStatus } from '~shared/types';
import { useToast } from '../components/Toast';
import { StatusBadge } from '../components/StatusBadge';

interface ScheduledTask {
  id: string;
  title: string;
  platform: Platform;
  scheduledAt?: number;
  status: TaskStatus;
  type: string;
  retryCount: number;
  maxRetries: number;
  error?: string;
}

// 定时任务创建弹窗
function CreateScheduledTaskModal({
  onClose,
  onCreated,
  initialDate,
}: {
  onClose: () => void;
  onCreated: (task: Task) => void;
  initialDate?: Date;
}) {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date());
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const result = await window.electronAPI?.listAccounts(platform);
      setAccounts(result ?? []);
      if (result && result.length > 0) {
        setSelectedAccountId(result[0].id);
      }
    } catch (error) {
      console.error('加载账号失败:', error);
    }
  };

  const handlePlatformChange = async (newPlatform: Platform) => {
    setPlatform(newPlatform);
    const result = await window.electronAPI?.listAccounts(newPlatform);
    setAccounts(result ?? []);
    if (result && result.length > 0) {
      setSelectedAccountId(result[0].id);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      showToast('请输入标题', 'error');
      return;
    }
    if (!selectedAccountId) {
      showToast('请选择账号', 'error');
      return;
    }

    // 计算定时发布时间戳
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(selectedHour, selectedMinute, 0, 0);

    if (scheduledAt.getTime() <= Date.now()) {
      showToast('定时发布时间必须晚于当前时间', 'error');
      return;
    }

    setCreating(true);
    try {
      const task = await window.electronAPI?.createTask({
        type: 'publish',
        platform,
        title: title.trim(),
        payload: {
          title: title.trim(),
          content: content.trim(),
          accountId: selectedAccountId,
        },
        scheduledAt: scheduledAt.getTime(),
      });

      if (task) {
        onCreated(task);
        onClose();
      }
    } catch (error) {
      console.error('创建定时任务失败:', error);
      showToast('创建定时任务失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const platformInfo = {
    douyin: { name: '抖音', icon: '🎵' },
    kuaishou: { name: '快手', icon: '📱' },
    xiaohongshu: { name: '小红书', icon: '📕' },
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-xl)',
          width: 480,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: 'var(--space-lg)' }}>创建定时任务</h2>

        {/* 平台选择 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>平台</label>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {(Object.keys(platformInfo) as Platform[]).map(p => (
              <button
                key={p}
                className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handlePlatformChange(p)}
              >
                {platformInfo[p].icon} {platformInfo[p].name}
              </button>
            ))}
          </div>
        </div>

        {/* 账号选择 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>发布账号</label>
          <select
            className="input"
            value={selectedAccountId || ''}
            onChange={e => setSelectedAccountId(e.target.value)}
          >
            {accounts.length === 0 ? (
              <option value="">暂无可用账号</option>
            ) : (
              accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.displayName || a.username}
                </option>
              ))
            )}
          </select>
        </div>

        {/* 定时设置 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>定时发布</label>
          <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
            <input
              type="date"
              className="input"
              style={{ flex: 1 }}
              value={selectedDate.toISOString().split('T')[0]}
              onChange={e => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
              min={new Date().toISOString().split('T')[0]}
            />
            <select
              className="input"
              style={{ width: 80 }}
              value={selectedHour}
              onChange={e => setSelectedHour(parseInt(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
              ))}
            </select>
            <span>:</span>
            <select
              className="input"
              style={{ width: 80 }}
              value={selectedMinute}
              onChange={e => setSelectedMinute(parseInt(e.target.value))}
            >
              {[0, 15, 30, 45].map(m => (
                <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 标题 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>标题</label>
          <input
            type="text"
            className="input"
            placeholder="输入视频/图文标题"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        {/* 内容 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>内容描述</label>
          <textarea
            className="input"
            placeholder="输入内容描述..."
            rows={4}
            value={content}
            onChange={e => setContent(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* 操作 */}
        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={creating}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? '创建中...' : '创建定时任务'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)',
};

// 日历组件
function CalendarPicker({
  tasks,
  currentMonth,
  onMonthChange,
  onSelectDate,
}: {
  tasks: ScheduledTask[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: Date) => void;
}) {
  const platformInfo = {
    douyin: { icon: '🎵' },
    kuaishou: { icon: '📱' },
    xiaohongshu: { icon: '📕' },
  };

  // 获取日历数据
  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // 第一天
    const firstDay = new Date(year, month, 1);
    // 最后一天
    const lastDay = new Date(year, month + 1, 0);

    // 月份第一天是星期几 (0-6)
    const startWeekday = firstDay.getDay();

    // 构建日历格子
    const days: { date: Date; isCurrentMonth: boolean; tasks: ScheduledTask[] }[] = [];

    // 上月的天数
    for (let i = startWeekday - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false, tasks: [] });
    }

    // 当月的天数
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dayTasks = tasks.filter(t => {
        if (!t.scheduledAt) return false;
        const taskDate = new Date(t.scheduledAt);
        return taskDate.getFullYear() === year &&
               taskDate.getMonth() === month &&
               taskDate.getDate() === d;
      });
      days.push({ date, isCurrentMonth: true, tasks: dayTasks });
    }

    // 补足到42个格子 (6行)
    while (days.length < 42) {
      const lastDate = days[days.length - 1].date;
      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + 1);
      days.push({ date: nextDate, isCurrentMonth: false, tasks: [] });
    }

    return days;
  }, [currentMonth, tasks]);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const prevMonth = () => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() - 1);
    onMonthChange(newMonth);
  };

  const nextMonth = () => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + 1);
    onMonthChange(newMonth);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-lg)',
      marginBottom: 'var(--space-xl)',
    }}>
      {/* 头部：月份导航 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-lg)',
      }}>
        <button
          className="btn btn-ghost"
          onClick={prevMonth}
          style={{ padding: '4px 8px' }}
        >
          ◀
        </button>
        <span style={{ fontWeight: 600, fontSize: 16 }}>
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
        </span>
        <button
          className="btn btn-ghost"
          onClick={nextMonth}
          style={{ padding: '4px 8px' }}
        >
          ▶
        </button>
      </div>

      {/* 星期标题 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 4,
        marginBottom: 8,
      }}>
        {weekDays.map(day => (
          <div
            key={day}
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-muted)',
              padding: '4px 0',
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 4,
      }}>
        {calendarData.map((day, index) => (
          <div
            key={index}
            onClick={() => day.isCurrentMonth && onSelectDate(day.date)}
            style={{
              position: 'relative',
              aspectRatio: '1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              cursor: day.isCurrentMonth ? 'pointer' : 'default',
              background: day.isCurrentMonth ? 'var(--bg-overlay)' : 'transparent',
              opacity: day.isCurrentMonth ? 1 : 0.3,
              border: isToday(day.date) ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            <span style={{
              fontSize: 14,
              fontWeight: isToday(day.date) ? 600 : 400,
            }}>
              {day.date.getDate()}
            </span>
            {/* 任务指示器 */}
            {day.tasks.length > 0 && (
              <div style={{
                position: 'absolute',
                bottom: 4,
                display: 'flex',
                gap: 2,
              }}>
                {day.tasks.slice(0, 3).map((t, i) => (
                  <span key={i} style={{ fontSize: 10 }}>
                    {platformInfo[t.platform]?.icon ?? '📦'}
                  </span>
                ))}
                {day.tasks.length > 3 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    +{day.tasks.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScheduledPublish() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const loadTasks = useCallback(async () => {
    try {
      const list = await window.electronAPI?.listTasks({ status: ['deferred'] });
      setTasks(list ?? []);
      setError(null);
    } catch (err) {
      console.error('Failed to load scheduled tasks:', err);
      setError('加载定时任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();

    window.electronAPI?.onTaskUpdated((task: Task) => {
      if (task.status === 'deferred') {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === task.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...task };
            return next;
          }
          return [{ ...task, platform: task.platform as Platform } as ScheduledTask, ...prev];
        });
      } else if (task.status === 'completed') {
        setTasks(prev => prev.filter(t => t.id !== task.id));
      } else if (task.status === 'cancelled') {
        setTasks(prev => prev.filter(t => t.id !== task.id));
      } else {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === task.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...task };
            return next;
          }
          return prev;
        });
      }
    });

    return () => {
      window.electronAPI?.removeAllListeners('task:updated');
    };
  }, [loadTasks]);

  const handleCancel = async (taskId: string) => {
    try {
      await window.electronAPI?.cancelTask(taskId);
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await window.electronAPI?.retryTask(taskId);
    } catch (err) {
      console.error('Failed to retry task:', err);
    }
  };

  const handleTaskCreated = (task: Task) => {
    setTasks(prev => [{
      ...task,
      platform: task.platform as Platform,
      status: task.status as TaskStatus,
      type: task.type,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
    } as ScheduledTask, ...prev]);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setShowCreateModal(true);
  };

  return (
    <div>
      {/* 快捷操作 */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-xl)'
      }}>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + 创建定时任务
        </button>
        <button className="btn btn-secondary">
          批量管理
        </button>
      </div>

      {/* 日历视图 */}
      <CalendarPicker
        tasks={tasks}
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
        onSelectDate={handleDateSelect}
      />

      {/* 定时任务列表 */}
      <div className="card">
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>定时任务</h3>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 72,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                animation: 'pulse 1.5s infinite'
              }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--error)' }}>
            <p>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={loadTasks}>
              重试
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3>暂无定时任务</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              创建定时发布任务，AI 将自动执行
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {tasks.map(task => (
              <ScheduledTaskRow
                key={task.id}
                task={task}
                onCancel={() => handleCancel(task.id)}
                onRetry={() => handleRetry(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 创建定时任务弹窗 */}
      {showCreateModal && (
        <CreateScheduledTaskModal
          onClose={() => {
            setShowCreateModal(false);
            setSelectedDate(undefined);
          }}
          onCreated={handleTaskCreated}
          initialDate={selectedDate}
        />
      )}
    </div>
  );
}

function ScheduledTaskRow({
  task,
  onCancel,
  onRetry,
}: {
  task: ScheduledTask;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const scheduledAt = task.scheduledAt ?? 0;
  const scheduledDate = new Date(scheduledAt);
  const timeUntil = scheduledAt - Date.now();
  const hoursUntil = Math.floor(timeUntil / 3600000);
  const minutesUntil = Math.floor((timeUntil % 3600000) / 60000);

  const platformInfo = {
    douyin: { name: '抖音', icon: '🎵' },
    kuaishou: { name: '快手', icon: '📱' },
    xiaohongshu: { name: '小红书', icon: '📕' },
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      padding: 'var(--space-md)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)',
    }}>
      {/* 时间 */}
      <div style={{
        textAlign: 'center',
        minWidth: 80,
        padding: 'var(--space-sm)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-overlay)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {hoursUntil > 0 ? `${hoursUntil}小时` : ''}{minutesUntil}分钟后
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>
          {scheduledDate.getMonth() + 1}/{scheduledDate.getDate()} {scheduledDate.getHours().toString().padStart(2, '0')}:{scheduledDate.getMinutes().toString().padStart(2, '0')}
        </div>
      </div>

      {/* 内容 */}
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xs)'
        }}>
          <span style={{ fontSize: 16 }}>
            {platformInfo[task.platform]?.icon ?? '📦'}
          </span>
          <span style={{ fontWeight: 500 }}>{task.title}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {platformInfo[task.platform]?.name ?? task.platform} · 定时发布
          {task.status === 'failed' && task.error && (
            <span style={{ color: 'var(--error)', marginLeft: 8 }}>错误: {task.error}</span>
          )}
        </div>
      </div>

      {/* 状态 */}
      <StatusBadge status={task.status} />

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
        {task.status === 'failed' && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, color: 'var(--primary)' }}
            onClick={onRetry}
          >
            重试
          </button>
        )}
        {(task.status === 'deferred' || task.status === 'pending') && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, color: 'var(--error)' }}
            onClick={onCancel}
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}
