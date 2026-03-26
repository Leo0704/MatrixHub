import { useMemo } from 'react';

interface ScheduledTask {
  id: string; title: string; platform: string; scheduledAt?: number;
  status: string; type: string; retryCount: number; maxRetries: number; error?: string;
}

interface Props {
  tasks: ScheduledTask[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: Date) => void;
}

const platformInfo = { douyin: { icon: '🎵' }, kuaishou: { icon: '📱' }, xiaohongshu: { icon: '📕' } };

export function CalendarPicker({ tasks, currentMonth, onMonthChange, onSelectDate }: Props) {
  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const days: { date: Date; isCurrentMonth: boolean; tasks: ScheduledTask[] }[] = [];

    for (let i = startWeekday - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false, tasks: [] });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dayTasks = tasks.filter(t => {
        if (!t.scheduledAt) return false;
        const taskDate = new Date(t.scheduledAt);
        return taskDate.getFullYear() === year && taskDate.getMonth() === month && taskDate.getDate() === d;
      });
      days.push({ date, isCurrentMonth: true, tasks: dayTasks });
    }
    while (days.length < 42) {
      const lastDate = days[days.length - 1].date;
      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + 1);
      days.push({ date: nextDate, isCurrentMonth: false, tasks: [] });
    }
    return days;
  }, [currentMonth, tasks]);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const prevMonth = () => { const newMonth = new Date(currentMonth); newMonth.setMonth(newMonth.getMonth() - 1); onMonthChange(newMonth); };
  const nextMonth = () => { const newMonth = new Date(currentMonth); newMonth.setMonth(newMonth.getMonth() + 1); onMonthChange(newMonth); };
  const isToday = (date: Date) => { const today = new Date(); return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear(); };

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
        <button className="btn btn-ghost" onClick={prevMonth} style={{ padding: '4px 8px' }}>◀</button>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月</span>
        <button className="btn btn-ghost" onClick={nextMonth} style={{ padding: '4px 8px' }}>▶</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
        {weekDays.map(day => (
          <div key={day} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>{day}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {calendarData.map((day, index) => (
          <div key={index} onClick={() => day.isCurrentMonth && onSelectDate(day.date)}
            style={{
              position: 'relative', aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-md)', cursor: day.isCurrentMonth ? 'pointer' : 'default',
              background: day.isCurrentMonth ? 'var(--bg-overlay)' : 'transparent',
              opacity: day.isCurrentMonth ? 1 : 0.3,
              border: isToday(day.date) ? '2px solid var(--primary)' : '2px solid transparent',
            }}>
            <span style={{ fontSize: 14, fontWeight: isToday(day.date) ? 600 : 400 }}>{day.date.getDate()}</span>
            {day.tasks.length > 0 && (
              <div style={{ position: 'absolute', bottom: 4, display: 'flex', gap: 2 }}>
                {day.tasks.slice(0, 3).map((t, i) => (
                  <span key={i} style={{ fontSize: 10 }}>{platformInfo[t.platform as keyof typeof platformInfo]?.icon ?? '📦'}</span>
                ))}
                {day.tasks.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{day.tasks.length - 3}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
