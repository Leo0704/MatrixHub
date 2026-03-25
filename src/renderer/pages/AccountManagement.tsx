import { useState, useEffect, useCallback } from 'react';
import type { Account, AccountGroup, Platform } from '~shared/types';
import { useToast } from '../components/Toast';
import EditAccountModal from '../components/EditAccountModal';
import { ConfirmModal } from '../components/ConfirmModal';

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
    action: string;
    actionLabel: string;
    platform: string;
    platformLabel: string;
    accountId?: string;
    riskMessage: string;
  } | null>(null);
  const { showToast } = useToast();

  // 监听自动化确认请求
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

    window.electronAPI?.onAccountAdded((account) => {
      setAccounts(prev => [account, ...prev]);
    });

    window.electronAPI?.onAccountUpdated((account) => {
      setAccounts(prev => prev.map(a => a.id === account.id ? account : a));
    });

    window.electronAPI?.onAccountRemoved(({ accountId }) => {
      setAccounts(prev => prev.filter(a => a.id !== accountId));
    });

    window.electronAPI?.onGroupCreated((group) => {
      setGroups(prev => [...prev, group]);
    });
    window.electronAPI?.onGroupUpdated((group) => {
      setGroups(prev => prev.map(g => g.id === group.id ? group : g));
    });
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
  }, []);

  const loadAccounts = async () => {
    try {
      const result = await window.electronAPI?.listAccounts();
      setAccounts(result ?? []);
    } catch (error) {
      showToast('加载账号失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const groupsResult = await window.electronAPI?.listGroups();
      setGroups(groupsResult ?? []);
    } catch (error) {
      showToast('加载分组失败', 'error');
    }
  };

  const filteredAccounts = selectedGroupId
    ? accounts.filter(a => a.groupId === selectedGroupId)
    : accounts;

  const handleRemove = async (id: string) => {
    setConfirmDelete(id);
  };

  const toggleAccountSelection = (id: string) => {
    setSelectedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
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

  const batchDeleteAccounts = async () => {
    if (selectedAccounts.size === 0) return;
    try {
      for (const id of selectedAccounts) {
        await window.electronAPI?.removeAccount(id);
      }
      showToast(`已删除 ${selectedAccounts.size} 个账号`, 'success');
      setSelectedAccounts(new Set());
    } catch {
      showToast('批量删除失败', 'error');
    }
  };

  const confirmRemove = async () => {
    if (confirmDelete) {
      try {
        await window.electronAPI?.removeAccount(confirmDelete);
        showToast('账号已删除', 'success');
      } catch {
        showToast('删除账号失败', 'error');
      }
      setConfirmDelete(null);
    }
  };

  if (loading) {
    return <div className="empty-state"><div className="empty-state-icon">⏳</div><p>加载中...</p></div>;
  }

  return (
    <div>
      {/* 操作栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-xl)'
      }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 13 }}
            onClick={() => setShowAddModal(true)}
          >
            + 添加账号
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 13 }}
            onClick={() => setShowGroupModal(true)}
          >
            管理分组
          </button>
          {selectedAccounts.size > 0 && (
            <button
              className="btn btn-danger"
              style={{ fontSize: 13 }}
              onClick={() => setBatchDeleteConfirm({ count: selectedAccounts.size })}
            >
              删除已选 ({selectedAccounts.size})
            </button>
          )}
        </div>
      </div>

      {/* 分组侧边栏 */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-xl)',
        marginBottom: 'var(--space-xl)'
      }}>
        <div style={{
          display: 'flex',
          gap: 'var(--space-sm)',
          flexWrap: 'wrap',
          flex: 1
        }}>
          <button
            className={`btn ${selectedGroupId === null ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 13 }}
            onClick={() => setSelectedGroupId(null)}
          >
            全部
          </button>
          {groups.map(group => (
            <button
              key={group.id}
              className={`btn ${selectedGroupId === group.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 13 }}
              onClick={() => setSelectedGroupId(group.id)}
            >
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 'var(--radius-full)',
                background: group.color,
                marginRight: 6
              }} />
              {group.name}
            </button>
          ))}
        </div>
      </div>

      {/* 账号列表 */}
      {filteredAccounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <h3>暂无账号</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
            添加你的第一个平台账号，开始内容创作与发布管理
          </p>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', textAlign: 'left', maxWidth: 300 }}>
            <p style={{ marginBottom: 'var(--space-sm)' }}>如何开始：</p>
            <ol style={{ paddingLeft: 'var(--space-lg)', lineHeight: 1.8 }}>
              <li>点击"添加账号"按钮</li>
              <li>选择要添加的平台（抖音/快手/小红书）</li>
              <li>输入平台的账号密码</li>
              <li>设置分组便于管理（可选）</li>
            </ol>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            aria-label="添加第一个账号"
          >
            添加账号
          </button>
        </div>
      ) : (
        <>
          {/* 全选栏 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
            marginBottom: 'var(--space-md)',
            padding: 'var(--space-sm) var(--space-md)',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)'
          }}>
            <input
              type="checkbox"
              checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0}
              onChange={selectAllAccounts}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              全选 ({filteredAccounts.length})
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)' }}>
            {filteredAccounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                groups={groups}
                selected={selectedAccounts.has(account.id)}
                onToggleSelect={() => toggleAccountSelection(account.id)}
                onRemove={() => handleRemove(account.id)}
                onEdit={() => setEditingAccount(account)}
              />
            ))}
          </div>
        </>
      )}

      {/* 添加账号弹窗 */}
      {showAddModal && (
        <AddAccountModal
          groups={groups}
          onClose={() => setShowAddModal(false)}
          onAdded={(account) => {
            setAccounts([account, ...accounts]);
            setShowAddModal(false);
          }}
        />
      )}

      {/* 分组管理弹窗 */}
      {showGroupModal && (
        <GroupManagerModal
          groups={groups}
          onClose={() => setShowGroupModal(false)}
        />
      )}

      {/* 编辑账号弹窗 */}
      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          groups={groups}
          onClose={() => setEditingAccount(null)}
          onSave={(updatedAccount) => {
            setAccounts(prev => prev.map(a => a.id === updatedAccount.id ? updatedAccount : a));
            setEditingAccount(null);
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {confirmDelete && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
          onClick={() => setConfirmDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-xl)',
            width: 400,
            border: '1px solid var(--border-subtle)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="delete-confirm-title" style={{ marginBottom: 'var(--space-md)' }}>确认删除</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
              确定要删除这个账号吗？此操作无法撤销。
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(null)}
              >
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmRemove}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自动化操作风险确认弹窗 */}
      {automationConfirm && (
        <ConfirmModal
          title={`确认执行 ${automationConfirm.actionLabel}`}
          message={`平台: ${automationConfirm.platformLabel}${automationConfirm.accountId ? `\n账号: ${automationConfirm.accountId}` : ''}\n\n⚠️ ${automationConfirm.riskMessage}`}
          confirmLabel="确认执行"
          cancelLabel="取消"
          variant="warning"
          onConfirm={() => sendAutomationConfirmResponse({ confirmed: true, dontAskAgain: false })}
          onCancel={() => sendAutomationConfirmResponse({ confirmed: false, dontAskAgain: false })}
        />
      )}

      {/* 批量删除确认弹窗 */}
      {batchDeleteConfirm && (
        <ConfirmModal
          title="确认批量删除"
          message={`确定要删除选中的 ${batchDeleteConfirm.count} 个账号吗？此操作无法撤销。`}
          confirmLabel="确认删除"
          cancelLabel="取消"
          variant="danger"
          onConfirm={() => {
            const ids = Array.from(selectedAccounts);
            setBatchDeleteConfirm(null);
            // 执行批量删除
            (async () => {
              try {
                for (const id of ids) {
                  await window.electronAPI?.removeAccount(id);
                }
                showToast(`已删除 ${ids.length} 个账号`, 'success');
                setSelectedAccounts(new Set());
              } catch {
                showToast('批量删除失败', 'error');
              }
            })();
          }}
          onCancel={() => setBatchDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

function AccountCard({
  account,
  groups,
  selected,
  onToggleSelect,
  onRemove,
  onEdit,
}: {
  account: Account;
  groups: AccountGroup[];
  selected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const platformInfo = {
    douyin: { name: '抖音', icon: '🎵', color: 'var(--platform-douyin)' },
    kuaishou: { name: '快手', icon: '📱', color: 'var(--platform-kuaishou)' },
    xiaohongshu: { name: '小红书', icon: '📕', color: 'var(--platform-xiaohongshu)' },
  };

  const info = platformInfo[account.platform];
  const group = account.groupId ? groups.find(g => g.id === account.groupId) : null;

  return (
    <div className="card" style={{
      border: selected ? '2px solid var(--primary)' : undefined,
      position: 'relative'
    }}>
      {/* 选择框 */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 1
      }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
      </div>

      {/* 头像和名称 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-lg)'
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-full)',
          background: info.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}>
          {info.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {account.displayName}
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            @{account.username}
          </div>
        </div>
      </div>

      {/* 状态 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-md)'
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: 'var(--radius-full)',
          background: account.status === 'active' ? 'var(--success)' :
                     account.status === 'error' ? 'var(--error)' :
                     account.status === 'pending_validation' ? 'var(--warning)' : 'var(--text-muted)',
        }} />
        <span style={{ fontSize: 13 }}>
          {account.status === 'active' ? '正常' :
           account.status === 'error' ? '异常' :
           account.status === 'pending_validation' ? '待验证' : '未激活'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {info.name}
        </span>
      </div>

      {/* 分组 */}
      {group && (
        <div style={{
          fontSize: 12,
          color: group.color,
          marginBottom: 'var(--space-sm)'
        }}>
          {group.name}
        </div>
      )}

      {/* 标签 */}
      {account.tags && account.tags.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginBottom: 'var(--space-sm)'
        }}>
          {account.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)'
              }}
            >
              {tag}
            </span>
          ))}
          {account.tags.length > 3 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              +{account.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 最后使用 */}
      {account.lastUsedAt && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-md)'
        }}>
          最后使用: {formatTime(account.lastUsedAt)}
        </div>
      )}

      {/* 上次验证时间 */}
      {account.lastValidatedAt && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-sm)'
        }}>
          验证: {formatTime(account.lastValidatedAt)}
        </div>
      )}

      {/* 操作 */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        paddingTop: 'var(--space-md)',
        borderTop: '1px solid var(--border-subtle)'
      }}>
        <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={onEdit}>
          编辑
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, color: 'var(--error)' }}
          onClick={onRemove}
        >
          删除
        </button>
      </div>
    </div>
  );
}

function AddAccountModal({
  groups,
  onClose,
  onAdded,
}: {
  groups: AccountGroup[];
  onClose: () => void;
  onAdded: (account: Account) => void;
}) {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [groupId, setGroupId] = useState<string | undefined>();
  const [tagsInput, setTagsInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | null>(null);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const checkPasswordStrength = (pwd: string) => {
    if (!pwd) { setPasswordStrength(null); return; }
    if (pwd.length < 6) { setPasswordStrength('weak'); return; }
    if (pwd.length >= 12 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) {
      setPasswordStrength('strong');
    } else {
      setPasswordStrength('medium');
    }
  };

  const validateUsername = (value: string) => {
    if (!value.trim()) {
      setUsernameError('请输入用户名或手机号');
    } else {
      setUsernameError('');
    }
  };

  const validatePassword = (value: string) => {
    if (!value.trim()) {
      setPasswordError('请输入密码');
    } else if (value.length < 6) {
      setPasswordError('密码至少需要6位');
    } else {
      setPasswordError('');
    }
  };

  const handleAdd = async () => {
    if (!username.trim()) {
      setUsernameError('请输入用户名或手机号');
      return;
    }
    if (!password.trim()) {
      setPasswordError('请输入密码');
      return;
    }
    if (password.length < 6) {
      setPasswordError('密码至少需要6位');
      return;
    }

    setAdding(true);
    try {
      const result = await window.electronAPI?.addAccount({
        platform,
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password: password.trim(),
        groupId,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      });

      if (!result || 'success' in result && !result.success) {
        setPasswordError((result as any)?.error || '添加账号失败');
        return;
      }

      const account = result as Account;

      // 验证账号凭证
      try {
        const validationResult = await window.electronAPI?.validateAccount(account.id);
        if (validationResult && !validationResult.valid) {
          // 标记账号为待验证状态
          await window.electronAPI?.updateAccount(account.id, { status: 'pending_validation' });
        }
      } catch {
        // 验证过程出错，标记为待验证
        await window.electronAPI?.updateAccount(account.id, { status: 'pending_validation' });
      }

      onAdded(account);
    } catch (error) {
      console.error('添加账号失败:', error);
      setPasswordError('添加账号时发生错误');
    } finally {
      setAdding(false);
    }
  };

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
      <div className="card" style={{ width: 400, maxWidth: '90vw' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>添加账号</h3>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>平台</label>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {(['douyin', 'kuaishou', 'xiaohongshu'] as Platform[]).map(p => (
              <button
                key={p}
                className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => setPlatform(p)}
              >
                {p === 'douyin' ? '🎵 抖音' : p === 'kuaishou' ? '📱 快手' : '📕 小红书'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>分组</label>
          <select
            className="input"
            style={{ width: '100%' }}
            value={groupId ?? ''}
            onChange={e => setGroupId(e.target.value || undefined)}
          >
            <option value="">无分组</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>标签</label>
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder="逗号分隔，如: 美妆,种草"
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle} htmlFor="username-input">用户名 / 手机号</label>
          <input
            id="username-input"
            className={`input ${usernameError ? 'input-error' : ''}`}
            style={{ width: '100%' }}
            placeholder="输入用户名或手机号"
            value={username}
            onChange={e => {
              setUsername(e.target.value);
              validateUsername(e.target.value);
            }}
            aria-describedby={usernameError ? 'username-error' : 'username-help'}
            aria-invalid={!!usernameError}
          />
          {usernameError && (
            <div id="username-error" style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }} role="alert">
              {usernameError}
            </div>
          )}
          {!usernameError && (
            <div id="username-help" className="field-help">
              支持平台账号密码或Cookie（格式：key=value; key=value）
            </div>
          )}
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>显示名称</label>
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder="选填，默认使用用户名"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle} htmlFor="password-input">密码</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password-input"
              className={`input ${passwordError ? 'input-error' : ''}`}
              type={showPassword ? 'text' : 'password'}
              style={{ width: '100%', paddingRight: 40 }}
              placeholder="输入密码"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                checkPasswordStrength(e.target.value);
                validatePassword(e.target.value);
              }}
              aria-describedby={passwordError ? 'password-error' : 'password-help'}
              aria-invalid={!!passwordError}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          {passwordError && (
            <div id="password-error" style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }} role="alert">
              {passwordError}
            </div>
          )}
          {!passwordError && passwordStrength && (
            <div className="password-strength">
              <div className={`strength-bar ${passwordStrength}`} />
              <span className="strength-label">
                {passwordStrength === 'weak' && '弱 (建议至少6位)'}
                {passwordStrength === 'medium' && '中等'}
                {passwordStrength === 'strong' && '强'}
              </span>
            </div>
          )}
        </div>

        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-lg)',
          padding: 'var(--space-sm)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
        }}>
          密码将加密存储在系统 Keychain 中
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={adding || !username.trim() || !password.trim()}
          >
            {adding ? '添加中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupManagerModal({
  groups,
  onClose,
}: {
  groups: AccountGroup[];
  onClose: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [groupAccountCounts, setGroupAccountCounts] = useState<Record<string, number>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ groupId: string; groupName: string; count: number } | null>(null);

  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

  // 加载各分组账号数量
  useEffect(() => {
    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      for (const group of groups) {
        try {
          const count = await window.electronAPI?.getGroupAccountCount(group.id);
          counts[group.id] = count ?? 0;
        } catch {
          counts[group.id] = 0;
        }
      }
      setGroupAccountCounts(counts);
    };
    loadCounts();
  }, [groups]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI?.createGroup(newName.trim(), newColor);
      setNewName('');
      setNewColor('#6366f1');
      setShowCreate(false);
    } catch (error) {
      console.error('创建分组失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI?.updateGroup(id, { name: editName.trim(), color: editColor });
      setEditingId(null);
    } catch (error) {
      console.error('更新分组失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async (group: AccountGroup) => {
    const count = groupAccountCounts[group.id] || 0;
    setDeleteConfirm({ groupId: group.id, groupName: group.name, count });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await window.electronAPI?.deleteGroup(deleteConfirm.groupId);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('删除分组失败:', error);
    }
  };

  const startEdit = (group: AccountGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
    setEditColor(group.color);
  };

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
      <div className="card" style={{ width: 480, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <h3>管理分组</h3>
          <button className="btn btn-ghost" style={{ fontSize: 20 }} onClick={onClose}>×</button>
        </div>

        {/* 新建分组表单 */}
        {showCreate ? (
          <div style={{
            marginBottom: 'var(--space-lg)',
            padding: 'var(--space-md)',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)'
          }}>
            <input
              className="input"
              style={{ width: '100%', marginBottom: 'var(--space-sm)' }}
              placeholder="分组名称"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
              {colors.map(c => (
                <button
                  key={c}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 'var(--radius-full)',
                    background: c,
                    border: newColor === c ? '2px solid white' : 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowCreate(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
              >
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            style={{ width: '100%', marginBottom: 'var(--space-lg)', fontSize: 13 }}
            onClick={() => setShowCreate(true)}
          >
            + 新建分组
          </button>
        )}

        {/* 分组列表 */}
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-lg)' }}>
              暂无分组
            </div>
          ) : (
            groups.map(group => (
              <div
                key={group.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-md)',
                  padding: 'var(--space-sm) 0',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                {editingId === group.id ? (
                  <>
                    <input
                      className="input"
                      style={{ flex: 1, fontSize: 13 }}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      {colors.map(c => (
                        <button
                          key={c}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 'var(--radius-full)',
                            background: c,
                            border: editColor === c ? '2px solid white' : 'none',
                            cursor: 'pointer'
                          }}
                          onClick={() => setEditColor(c)}
                        />
                      ))}
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      onClick={() => handleUpdate(group.id)}
                      disabled={saving}
                    >
                      保存
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{
                      width: 10,
                      height: 10,
                      borderRadius: 'var(--radius-full)',
                      background: group.color
                    }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{group.name}</span>
                    {groupAccountCounts[group.id] > 0 && (
                      <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-elevated)',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        {groupAccountCounts[group.id]} 个账号
                      </span>
                    )}
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      onClick={() => startEdit(group)}
                    >
                      编辑
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '4px 8px', color: 'var(--error)' }}
                      onClick={() => handleDeleteClick(group)}
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-xl)',
            width: 380,
            border: '1px solid var(--border-subtle)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 'var(--space-md)' }}>确认删除分组</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
              确定要删除分组 "<strong>{deleteConfirm.groupName}</strong>" 吗？
            </p>
            {deleteConfirm.count > 0 && (
              <div style={{
                fontSize: 13,
                padding: 'var(--space-sm) var(--space-md)',
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-md)',
                color: 'var(--warning)'
              }}>
                ⚠️ 此分组下有 <strong>{deleteConfirm.count}</strong> 个账号，删除后这些账号将变为无分组状态
              </div>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 'var(--space-lg)' }}>
              此操作无法撤销。
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmDelete}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
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

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}
