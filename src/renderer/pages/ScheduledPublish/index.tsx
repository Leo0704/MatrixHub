import { useState, useEffect, useCallback } from 'react';
import type { Task, Platform, TaskStatus } from '~shared/types';
import { CreateScheduledTaskModal } from './components/CreateScheduledTaskModal';
import { CalendarPicker } from './components/CalendarPicker';
import { ScheduledTaskRow } from './components/ScheduledTaskRow';

interface ScheduledTask {
  id: string; title: string; platform: Platform; scheduledAt?: number;
  status: TaskStatus; type: string; retryCount: number; maxRetries: number; error?: string;
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
      setTasks(list ?? []); setError(null);
    } catch (err) { console.error('Failed to load scheduled tasks:', err); setError('加载定时任务失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadTasks();
    window.electronAPI?.onTaskUpdated((task: Task) => {
      if (task.status === 'deferred') {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === task.id);
          if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...task }; return next; }
          return [{ ...task, platform: task.platform as Platform, status: task.status as TaskStatus, type: task.type, retryCount: task.retryCount, maxRetries: task.maxRetries } as ScheduledTask, ...prev];
        });
      } else if (task.status === 'completed' || task.status === 'cancelled') {
        setTasks(prev => prev.filter(t => t.id !== task.id));
      } else {
        setTasks(prev => { const idx = prev.findIndex(t => t.id === task.id); if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...task }; return next; } return prev; });
      }
    });
    return () => { window.electronAPI?.removeAllListeners('task:updated'); };
  }, [loadTasks]);

  const handleCancel = async (taskId: string) => { try { await window.electronAPI?.cancelTask(taskId); } catch (err) { console.error('Failed to cancel task:', err); } };
  const handleRetry = async (taskId: string) => { try { await window.electronAPI?.retryTask(taskId); } catch (err) { console.error('Failed to retry task:', err); } };
  const handleTaskCreated = (task: Task) => { setTasks(prev => [{ ...task, platform: task.platform as Platform, status: task.status as TaskStatus, type: task.type, retryCount: task.retryCount, maxRetries: task.maxRetries } as ScheduledTask, ...prev]); };
  const handleDateSelect = (date: Date) => { setSelectedDate(date); setShowCreateModal(true); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>+ 创建定时任务</button>
        <button className="btn btn-secondary">批量管理</button>
      </div>

      <CalendarPicker tasks={tasks} currentMonth={currentMonth} onMonthChange={setCurrentMonth} onSelectDate={handleDateSelect} />

      <div className="card">
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>定时任务</h3>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 72, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite' }} />)}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--error)' }}>
            <p>{error}</p><button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={loadTasks}>重试</button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div><h3>暂无定时任务</h3>
            <p style={{ color: 'var(--text-muted)' }}>创建定时发布任务，AI 将自动执行</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {tasks.map(task => <ScheduledTaskRow key={task.id} task={task} onCancel={() => handleCancel(task.id)} onRetry={() => handleRetry(task.id)} />)}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateScheduledTaskModal onClose={() => { setShowCreateModal(false); setSelectedDate(undefined); }} onCreated={handleTaskCreated} initialDate={selectedDate} />
      )}
    </div>
  );
}
