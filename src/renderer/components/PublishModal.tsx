import { useState, useEffect } from 'react';
import type { Platform, Account, AccountGroup } from '~shared/types';
import { useToast } from './Toast';

interface PublishModalProps {
  isOpen: boolean;
  platform: Platform;
  title: string;
  content: string;
  onClose: () => void;
  onPublished: (taskIds: string[]) => void;
}

const platformNames: Record<Platform, string> = {
  douyin: '🎵 抖音',
};

export default function PublishModal({
  isOpen,
  platform,
  title,
  content,
  onClose,
  onPublished,
}: PublishModalProps) {
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      // 重置选择状态
      setSelectedAccountIds([]);
      setExpandedGroups(new Set());
      loadGroups();
      loadAccounts();
    }
  }, [isOpen, platform]);

  const loadGroups = async () => {
    const result = await window.electronAPI?.listGroups();
    setGroups(result ?? []);
  };

  const loadAccounts = async () => {
    const result = await window.electronAPI?.listAccounts();
    // 关键：只保留匹配平台的账号
    setAccounts((result ?? []).filter(a => a.platform === platform));
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
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
    setSelectedAccountIds(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const isGroupFullySelected = (groupId: string) => {
    const groupAccountIds = accounts.filter(a => a.groupId === groupId).map(a => a.id);
    return groupAccountIds.length > 0 && groupAccountIds.every(id => selectedAccountIds.includes(id));
  };

  const isGroupPartiallySelected = (groupId: string) => {
    const groupAccountIds = accounts.filter(a => a.groupId === groupId).map(a => a.id);
    const selectedCount = groupAccountIds.filter(id => selectedAccountIds.includes(id)).length;
    return selectedCount > 0 && selectedCount < groupAccountIds.length;
  };

  const handlePublish = async () => {
    if (selectedAccountIds.length === 0) return;
    setPublishing(true);
    const taskIds: string[] = [];
    const successAccounts: string[] = [];
    const failedAccounts: { id: string; name: string; error: string }[] = [];

    try {
      for (const accountId of selectedAccountIds) {
        const account = accounts.find(a => a.id === accountId);
        const accountName = account?.displayName || account?.username || accountId;
        try {
          const task = await window.electronAPI?.createTask({
            type: 'publish',
            platform,
            title,
            payload: { title, content, accountId },
          });
          if (task?.id) {
            taskIds.push(task.id);
            successAccounts.push(accountName);
          } else {
            failedAccounts.push({ id: accountId, name: accountName, error: '创建任务失败' });
          }
        } catch (err) {
          failedAccounts.push({ id: accountId, name: accountName, error: '发布异常' });
        }
      }

      // 显示详细反馈
      if (failedAccounts.length === 0) {
        showToast(`已成功发布到 ${successAccounts.length} 个账号`, 'success');
      } else if (successAccounts.length === 0) {
        showToast(`发布失败: ${failedAccounts.map(f => f.name).join(', ')}`, 'error');
      } else {
        const successList = successAccounts.slice(0, 3).join(', ');
        const moreCount = successAccounts.length > 3 ? `等${successAccounts.length}个` : '';
        showToast(`成功: ${successList}${moreCount}；失败: ${failedAccounts.map(f => f.name).join(', ')}`, 'warning');
      }
      onPublished(taskIds);
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="card" style={{ width: 480, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>一键发布</h3>

        {/* 平台提示 */}
        <div style={{
          marginBottom: 'var(--space-lg)',
          padding: 'var(--space-sm)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}>
          将发布到 {platformNames[platform]}
        </div>

        {/* 账号选择 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 'var(--space-sm)', color: 'var(--text-secondary)' }}>
            选择账号 {selectedAccountIds.length > 0 && `(${selectedAccountIds.length}已选)`}
          </label>

          {/* 分组快捷选择 */}
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
          </div>

          {/* 展开的分组账号列表 */}
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

          {/* 未分组账号 */}
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

          {accounts.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-lg)' }}>
              暂无可用的 {platformNames[platform]} 账号
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={publishing || selectedAccountIds.length === 0}
          >
            {publishing ? '发布中...' : `发布到 ${selectedAccountIds.length} 个账号`}
          </button>
        </div>
      </div>
    </div>
  );
}
