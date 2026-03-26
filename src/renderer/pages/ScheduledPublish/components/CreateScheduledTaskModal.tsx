import { useState, useEffect } from 'react';
import type { Task, Platform, Account } from '~shared/types';
import { useToast } from '../../../components/Toast';

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' };

interface Props {
  onClose: () => void;
  onCreated: (task: Task) => void;
  initialDate?: Date;
}

export function CreateScheduledTaskModal({ onClose, onCreated, initialDate }: Props) {
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

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    try {
      const result = await window.electronAPI?.listAccounts(platform);
      setAccounts(result ?? []);
      if (result && result.length > 0) setSelectedAccountId(result[0].id);
    } catch (error) { console.error('加载账号失败:', error); }
  };

  const handlePlatformChange = async (newPlatform: Platform) => {
    setPlatform(newPlatform);
    const result = await window.electronAPI?.listAccounts(newPlatform);
    setAccounts(result ?? []);
    if (result && result.length > 0) setSelectedAccountId(result[0].id);
  };

  const handleCreate = async () => {
    if (!title.trim()) { showToast('请输入标题', 'error'); return; }
    if (!selectedAccountId) { showToast('请选择账号', 'error'); return; }
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(selectedHour, selectedMinute, 0, 0);
    if (scheduledAt.getTime() <= Date.now()) { showToast('定时发布时间必须晚于当前时间', 'error'); return; }

    setCreating(true);
    try {
      const task = await window.electronAPI?.createTask({
        type: 'publish', platform, title: title.trim(),
        payload: { title: title.trim(), content: content.trim(), accountId: selectedAccountId },
        scheduledAt: scheduledAt.getTime(),
      });
      if (task) { onCreated(task); onClose(); }
    } catch (error) { console.error('创建定时任务失败:', error); showToast('创建定时任务失败', 'error'); }
    finally { setCreating(false); }
  };

  const platformInfo = { douyin: { name: '抖音', icon: '🎵' } };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', width: 480, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 'var(--space-lg)' }}>创建定时任务</h2>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>平台</label>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {(Object.keys(platformInfo) as Platform[]).map(p => (
              <button key={p} className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handlePlatformChange(p)}>
                {platformInfo[p].icon} {platformInfo[p].name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>发布账号</label>
          <select className="input" value={selectedAccountId || ''} onChange={e => setSelectedAccountId(e.target.value)}>
            {accounts.length === 0 ? <option value="">暂无可用账号</option> : accounts.map(a => <option key={a.id} value={a.id}>{a.displayName || a.username}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>定时发布</label>
          <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
            <input type="date" className="input" style={{ flex: 1 }} value={selectedDate.toISOString().split('T')[0]}
              onChange={e => setSelectedDate(new Date(e.target.value + 'T00:00:00'))} min={new Date().toISOString().split('T')[0]} />
            <select className="input" style={{ width: 80 }} value={selectedHour} onChange={e => setSelectedHour(parseInt(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>)}
            </select>
            <span>:</span>
            <select className="input" style={{ width: 80 }} value={selectedMinute} onChange={e => setSelectedMinute(parseInt(e.target.value))}>
              {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>标题</label>
          <input type="text" className="input" placeholder="输入视频/图文标题" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>内容描述</label>
          <textarea className="input" placeholder="输入内容描述..." rows={4} value={content} onChange={e => setContent(e.target.value)} style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={creating}>取消</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>{creating ? '创建中...' : '创建定时任务'}</button>
        </div>
      </div>
    </div>
  );
}
