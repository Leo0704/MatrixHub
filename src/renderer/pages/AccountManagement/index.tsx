import { useState, useEffect, useCallback } from 'react';
import type { Account, AccountGroup } from '~shared/types';
import { useToast } from '../../components/Toast';
import EditAccountModal from '../../components/EditAccountModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { AccountCard } from './components/AccountCard';
import { AddAccountModal } from './components/AddAccountModal';
import { GroupManagerModal } from './components/GroupManagerModal';

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ count: number } | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [automationConfirm, setAutomationConfirm] = useState<{
    action: string; actionLabel: string; platform: string; platformLabel: string;
    accountId?: string; riskMessage: string;
  } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    window.electronAPI?.onAutomationConfirmRequest((params) => {
      setAutomationConfirm(params);
    });
  }, []);

  const sendAutomationConfirmResponse = useCallback((result: { confirmed: boolean; dontAskAgain: boolean }) => {
    window.electronAPI?.sendAutomationConfirmResponse(result);
    setAutomationConfirm(null);
  }, []);

  useEffect(() => {
    loadAccounts();
    loadGroups();

    window.electronAPI?.onAccountAdded((account) => setAccounts(prev => [account, ...prev]));
    window.electronAPI?.onAccountUpdated((account) => setAccounts(prev => prev.map(a => a.id === account.id ? account : a)));
    window.electronAPI?.onAccountRemoved(({ accountId }) => setAccounts(prev => prev.filter(a => a.id !== accountId)));
    window.electronAPI?.onGroupCreated((group) => setGroups(prev => [...prev, group]));
    window.electronAPI?.onGroupUpdated((group) => setGroups(prev => prev.map(g => g.id === group.id ? group : g)));
    window.electronAPI?.onGroupDeleted(({ groupId }) => {
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (selectedGroupId === groupId) setSelectedGroupId(null);
    });

    return () => {
      window.electronAPI?.removeAllListeners('account:added');
      window.electronAPI?.removeAllListeners('account:updated');
      window.electronAPI?.removeAllListeners('account:removed');
      window.electronAPI?.removeAllListeners('group:created');
      window.electronAPI?.removeAllListeners('group:updated');
      window.electronAPI?.removeAllListeners('group:deleted');
    };
  }, [selectedGroupId]);

  const loadAccounts = async () => {
    try {
      const result = await window.electronAPI?.listAccounts();
      setAccounts(result ?? []);
    } catch { showToast('加载账号失败', 'error'); }
    finally { setLoading(false); }
  };

  const loadGroups = async () => {
    try {
      const groupsResult = await window.electronAPI?.listGroups();
      setGroups(groupsResult ?? []);
    } catch { showToast('加载分组失败', 'error'); }
  };

  const filteredAccounts = selectedGroupId ? accounts.filter(a => a.groupId === selectedGroupId) : accounts;

  const handleRemove = (id: string) => setConfirmDelete(id);

  const toggleAccountSelection = (id: string) => {
    setSelectedAccounts(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const selectAllAccounts = () => {
    if (selectedAccounts.size === filteredAccounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(filteredAccounts.map(a => a.id)));
    }
  };


  const confirmRemove = async () => {
    if (!confirmDelete) return;
    try {
      await window.electronAPI?.removeAccount(confirmDelete);
      showToast('账号已删除', 'success');
    } catch { showToast('删除账号失败', 'error'); }
    setConfirmDelete(null);
  };

  if (loading) {
    return <div className="empty-state"><div className="empty-state-icon">⏳</div><p>加载中...</p></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowAddModal(true)}>+ 添加账号</button>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowGroupModal(true)}>管理分组</button>
          {selectedAccounts.size > 0 && (
            <button className="btn btn-danger" style={{ fontSize: 13 }} onClick={() => setBatchDeleteConfirm({ count: selectedAccounts.size })}>
              删除已选 ({selectedAccounts.size})
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-xl)', marginBottom: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', flex: 1 }}>
          <button className={`btn ${selectedGroupId === null ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 13 }} onClick={() => setSelectedGroupId(null)}>全部</button>
          {groups.map(group => (
            <button key={group.id} className={`btn ${selectedGroupId === group.id ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 13 }} onClick={() => setSelectedGroupId(group.id)}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 'var(--radius-full)', background: group.color, marginRight: 6 }} />
              {group.name}
            </button>
          ))}
        </div>
      </div>

      {filteredAccounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <h3>暂无账号</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>添加你的第一个平台账号，开始内容创作与发布管理</p>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', textAlign: 'left', maxWidth: 300 }}>
            <p style={{ marginBottom: 'var(--space-sm)' }}>如何开始：</p>
            <ol style={{ paddingLeft: 'var(--space-lg)', lineHeight: 1.8 }}>
              <li>点击"添加账号"按钮</li><li>选择要添加的平台（抖音/快手/小红书）</li>
              <li>输入平台的账号密码</li><li>设置分组便于管理（可选）</li>
            </ol>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} aria-label="添加第一个账号">添加账号</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
            <input type="checkbox" checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0} onChange={selectAllAccounts} style={{ width: 16, height: 16, cursor: 'pointer' }}
              aria-label="全选" />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>全选 ({filteredAccounts.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)' }}>
            {filteredAccounts.map(account => (
              <AccountCard key={account.id} account={account} groups={groups} selected={selectedAccounts.has(account.id)}
                onToggleSelect={() => toggleAccountSelection(account.id)} onRemove={() => handleRemove(account.id)} onEdit={() => setEditingAccount(account)} />
            ))}
          </div>
        </>
      )}

      {showAddModal && (
        <AddAccountModal groups={groups} onClose={() => setShowAddModal(false)}
          onAdded={(account) => { setAccounts([account, ...accounts]); setShowAddModal(false); }} />
      )}

      {showGroupModal && <GroupManagerModal groups={groups} onClose={() => setShowGroupModal(false)} />}

      {editingAccount && (
        <EditAccountModal account={editingAccount} groups={groups} onClose={() => setEditingAccount(null)}
          onSave={(updatedAccount) => { setAccounts(prev => prev.map(a => a.id === updatedAccount.id ? updatedAccount : a)); setEditingAccount(null); }} />
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setConfirmDelete(null)} role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', width: 400, border: '1px solid var(--border-subtle)' }}
            onClick={e => e.stopPropagation()}>
            <h3 id="delete-confirm-title" style={{ marginBottom: 'var(--space-md)' }}>确认删除</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>确定要删除这个账号吗？此操作无法撤销。</p>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>取消</button>
              <button className="btn btn-danger" onClick={confirmRemove}>删除</button>
            </div>
          </div>
        </div>
      )}

      {automationConfirm && (
        <ConfirmModal title={`确认执行 ${automationConfirm.actionLabel}`}
          message={`平台: ${automationConfirm.platformLabel}${automationConfirm.accountId ? `\n账号: ${automationConfirm.accountId}` : ''}\n\n⚠️ ${automationConfirm.riskMessage}`}
          confirmLabel="确认执行" cancelLabel="取消" variant="warning"
          onConfirm={() => sendAutomationConfirmResponse({ confirmed: true, dontAskAgain: false })}
          onCancel={() => sendAutomationConfirmResponse({ confirmed: false, dontAskAgain: false })} />
      )}

      {batchDeleteConfirm && (
        <ConfirmModal title="确认批量删除" message={`确定要删除选中的 ${batchDeleteConfirm.count} 个账号吗？此操作无法撤销。`}
          confirmLabel="确认删除" cancelLabel="取消" variant="danger"
          onConfirm={() => {
            const ids = Array.from(selectedAccounts);
            setBatchDeleteConfirm(null);
            (async () => {
              try {
                for (const id of ids) { await window.electronAPI?.removeAccount(id); }
                showToast(`已删除 ${ids.length} 个账号`, 'success');
                setSelectedAccounts(new Set());
              } catch { showToast('批量删除失败', 'error'); }
            })();
          }}
          onCancel={() => setBatchDeleteConfirm(null)} />
      )}
    </div>
  );
}
