import { useState, useEffect, useRef } from 'react';
import type { Platform, Task, AccountGroup, Account } from '~shared/types';
import { useAppStore } from '../../../stores/appStore';
import { useToast } from '../../../components/Toast';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-sm)',
};

interface CreateTaskModalProps {
  onClose: () => void;
  onCreated: (task: Task) => void;
}

export function CreateTaskModal({ onClose, onCreated }: CreateTaskModalProps) {
  const { showToast } = useToast();
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [enableInterval, setEnableInterval] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [contentMode, setContentMode] = useState<'text' | 'image' | 'voice'>('text');

  // Validation errors
  const [titleError, setTitleError] = useState('');
  const [accountError, setAccountError] = useState('');

  // Real-time validation
  const validateTitle = (value: string) => {
    if (!value.trim()) {
      setTitleError('请输入标题');
    } else if (value.trim().length < 5) {
      setTitleError('标题至少需要5个字符');
    } else {
      setTitleError('');
    }
  };

  // Validate accounts when selection changes
  useEffect(() => {
    if (selectedAccountIds.length === 0) {
      setAccountError('请选择至少一个账号');
    } else {
      setAccountError('');
    }
  }, [selectedAccountIds]);

  const { taskDraft, setTaskDraft, clearTaskDraft } = useAppStore();
  const draftInitializedRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [onClose]);

  // Pre-fill from draft when modal opens
  useEffect(() => {
    if (taskDraft && !draftInitializedRef.current && !title && !content) {
      setTitle(taskDraft.title);
      setContent(taskDraft.content);
      if (taskDraft.platform) setPlatform(taskDraft.platform as Platform);
      if (taskDraft.accountIds.length) setSelectedAccountIds(taskDraft.accountIds);
      if (taskDraft.contentMode) setContentMode(taskDraft.contentMode);
      draftInitializedRef.current = true;
    }
  }, [taskDraft]);

  // Auto-save on changes (only after draft was initialized)
  useEffect(() => {
    if (draftInitializedRef.current && (title || content)) {
      setTaskDraft({ title, content, platform, accountIds: selectedAccountIds, contentMode });
    }
  }, [title, content, platform, selectedAccountIds, contentMode]);

  useEffect(() => {
    loadGroups();
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const loadGroups = async () => {
    try {
      const groupsResult = await window.electronAPI?.listGroups();
      setGroups(groupsResult ?? []);
    } catch (error) {
      console.error('加载分组失败:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      const result = await window.electronAPI?.listAccounts();
      // 按选择的平台过滤账号
      setAccounts((result ?? []).filter(a => a.platform === platform));
    } catch (error) {
      console.error('加载账号失败:', error);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleGroupSelection = (groupId: string) => {
    const groupAccountIds = accounts
      .filter(a => a.groupId === groupId)
      .map(a => a.id);
    const allSelected = groupAccountIds.every(id => selectedAccountIds.includes(id));
    if (allSelected) {
      setSelectedAccountIds(prev => prev.filter(id => !groupAccountIds.includes(id)));
    } else {
      setSelectedAccountIds(prev => [...new Set([...prev, ...groupAccountIds])]);
    }
  };

  const toggleAccountSelection = (accountId: string) => {
    setSelectedAccountIds(prev => {
      if (prev.includes(accountId)) {
        return prev.filter(id => id !== accountId);
      } else {
        return [...prev, accountId];
      }
    });
  };

  const handleCreate = async () => {
    // Validate title
    if (!title.trim()) {
      setTitleError('请输入标题');
      return;
    }
    if (title.trim().length < 5) {
      setTitleError('标题至少需要5个字符');
      return;
    }

    // Validate accounts
    if (selectedAccountIds.length === 0) {
      setAccountError('请选择至少一个账号');
      showToast('请选择至少一个账号', 'error');
      return;
    }

    setCreating(true);
    let successCount = 0;
    let failCount = 0;
    const failReasons: string[] = [];

    try {
      // Create one task per selected account
      // If interval is enabled, each task is scheduled at different times
      const baseTime = enableInterval ? Date.now() : 0;

      for (let i = 0; i < selectedAccountIds.length; i++) {
        const accountId = selectedAccountIds[i];
        // Calculate scheduled time: baseTime + (index * intervalMinutes)
        const scheduledAt = enableInterval
          ? baseTime + (i * intervalMinutes * 60 * 1000)
          : undefined;

        try {
          const task = await window.electronAPI?.createTask({
            type: 'publish',
            platform,
            title: title.trim(),
            payload: {
              title: title.trim(),
              content: content.trim(),
              accountId,
            },
            scheduledAt,
          });
          if (task) {
            onCreated(task);
            successCount++;
          } else {
            failCount++;
            failReasons.push(`账号 ${accountId.slice(0, 8)}... 创建失败`);
          }
        } catch (err) {
          failCount++;
          failReasons.push(`账号 ${accountId.slice(0, 8)}... 异常`);
        }
      }

      // 显示详细反馈
      if (failCount === 0) {
        showToast(`成功创建 ${successCount} 个任务`, 'success');
      } else if (successCount === 0) {
        showToast(`创建失败: ${failReasons[0]}`, 'error');
      } else {
        showToast(`成功 ${successCount} 个，失败 ${failCount} 个`, 'warning');
      }

      clearTaskDraft();
    } catch (error) {
      console.error('创建任务失败:', error);
    } finally {
      setCreating(false);
    }
  };

  const isGroupFullySelected = (groupId: string) => {
    const groupAccountIds = accounts
      .filter(a => a.groupId === groupId)
      .map(a => a.id);
    return groupAccountIds.length > 0 && groupAccountIds.every(id => selectedAccountIds.includes(id));
  };

  const isGroupPartiallySelected = (groupId: string) => {
    const groupAccountIds = accounts
      .filter(a => a.groupId === groupId)
      .map(a => a.id);
    const selectedCount = groupAccountIds.filter(id => selectedAccountIds.includes(id)).length;
    return selectedCount > 0 && selectedCount < groupAccountIds.length;
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={modalRef}
        className="card"
        style={{ width: 500, maxWidth: '90vw' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        tabIndex={-1}
      >
        <h3 id="create-task-title" style={{ marginBottom: 'var(--space-lg)' }}>新建内容</h3>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle} id="platform-label">平台</label>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }} role="radiogroup" aria-labelledby="platform-label">
            {(['douyin', 'kuaishou', 'xiaohongshu'] as Platform[]).map(p => (
              <button
                key={p}
                className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => setPlatform(p)}
                role="radio"
                aria-checked={platform === p}
                aria-label={p === 'douyin' ? '抖音' : p === 'kuaishou' ? '快手' : '小红书'}
              >
                {p === 'douyin' ? '🎵 抖音' : p === 'kuaishou' ? '📱 快手' : '📕 小红书'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle} id="account-selection-label">选择账号 {selectedAccountIds.length > 0 && `(${selectedAccountIds.length}已选)`}</label>
          {accountError && (
            <div style={{ fontSize: 12, color: 'var(--error)', marginBottom: 4 }} role="alert">
              {accountError}
            </div>
          )}
          {/* Group chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            {groups.map(group => {
              const isFullySelected = isGroupFullySelected(group.id);
              const isPartiallySelected = isGroupPartiallySelected(group.id);
              return (
                <button
                  key={group.id}
                  className={`btn ${isFullySelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    borderColor: group.color,
                    color: isFullySelected ? '#fff' : group.color,
                    background: isFullySelected ? group.color : 'transparent',
                  }}
                  onClick={() => {
                    toggleGroupSelection(group.id);
                    toggleGroup(group.id);
                  }}
                >
                  {group.name} {isPartiallySelected && '(部分)'}
                </button>
              );
            })}
            {groups.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无可用分组</span>
            )}
          </div>
          {/* Expanded group accounts */}
          {groups.filter(g => expandedGroups.has(g.id)).map(group => {
            const groupAccounts = accounts.filter(a => a.groupId === group.id);
            if (groupAccounts.length === 0) return null;
            return (
              <div key={group.id} style={{
                marginTop: 'var(--space-sm)',
                padding: 'var(--space-sm)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
                  {group.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
                  {groupAccounts.map(account => (
                    <label
                      key={account.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        padding: '2px 6px',
                        background: selectedAccountIds.includes(account.id) ? 'var(--primary)' : 'var(--bg-base)',
                        color: selectedAccountIds.includes(account.id) ? '#fff' : 'inherit',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAccountIds.includes(account.id)}
                        onChange={() => toggleAccountSelection(account.id)}
                        style={{ display: 'none' }}
                      />
                      {account.displayName || account.username}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {/* Ungrouped accounts */}
          {accounts.filter(a => !a.groupId).length > 0 && (
            <div style={{
              marginTop: 'var(--space-sm)',
              padding: 'var(--space-sm)',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
                未分组
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
                {accounts.filter(a => !a.groupId).map(account => (
                  <label
                    key={account.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      padding: '2px 6px',
                      background: selectedAccountIds.includes(account.id) ? 'var(--primary)' : 'var(--bg-base)',
                      color: selectedAccountIds.includes(account.id) ? '#fff' : 'inherit',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.includes(account.id)}
                      onChange={() => toggleAccountSelection(account.id)}
                      style={{ display: 'none' }}
                    />
                    {account.displayName || account.username}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle} htmlFor="task-title">标题</label>
          <input
            id="task-title"
            className={`input ${titleError ? 'input-error' : ''}`}
            style={{ width: '100%' }}
            placeholder="输入内容标题"
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              validateTitle(e.target.value);
            }}
            aria-describedby={titleError ? 'title-error' : undefined}
            aria-invalid={!!titleError}
          />
          {titleError && (
            <div id="title-error" style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }}>
              {titleError}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>内容</label>
          <textarea
            className="input"
            style={{
              width: '100%',
              height: 120,
              padding: 'var(--space-md)',
              resize: 'none',
            }}
            placeholder="输入正文内容"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </div>

        {/* 间隔发布选项 */}
        {selectedAccountIds.length > 1 && (
          <div style={{
            marginBottom: 'var(--space-lg)',
            padding: 'var(--space-md)',
            background: 'var(--bg-overlay)',
            borderRadius: 'var(--radius-md)',
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={enableInterval}
                onChange={e => setEnableInterval(e.target.checked)}
              />
              <span style={{ fontSize: 13, fontWeight: 500 }}>启用间隔发布</span>
            </label>
            {enableInterval && (
              <div style={{
                marginTop: 'var(--space-sm)',
                marginLeft: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>每</span>
                <input
                  type="number"
                  className="input"
                  style={{ width: 60, textAlign: 'center' }}
                  min="1"
                  max="1440"
                  value={intervalMinutes}
                  onChange={e => setIntervalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>分钟发布下一个</span>
              </div>
            )}
            {enableInterval && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginLeft: 24 }}>
                提示：{selectedAccountIds.length}个账号将分别在 {intervalMinutes} 分钟间隔后依次发布
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !title.trim() || selectedAccountIds.length === 0}
          >
            {creating ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
