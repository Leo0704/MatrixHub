import { useState, useEffect } from 'react';
import type { Account, AccountGroup, Platform } from '~shared/types';

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [loading, setLoading] = useState(true);

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
  }, [selectedGroupId]);

  const loadAccounts = async () => {
    try {
      const result = await window.electronAPI?.listAccounts();
      setAccounts(result ?? []);
    } catch (error) {
      console.error('加载账号失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const groupsResult = await window.electronAPI?.listGroups();
      setGroups(groupsResult ?? []);
    } catch (error) {
      console.error('加载分组失败:', error);
    }
  };

  const filteredAccounts = selectedGroupId
    ? accounts.filter(a => a.groupId === selectedGroupId)
    : accounts;

  const handleRemove = async (id: string) => {
    if (confirm('确定要删除这个账号吗？')) {
      await window.electronAPI?.removeAccount(id);
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
          <div className="empty-state-icon">🔑</div>
          <h3>暂无账号</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
            添加你的第一个平台账号
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            添加账号
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)' }}>
          {filteredAccounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              groups={groups}
              onRemove={() => handleRemove(account.id)}
            />
          ))}
        </div>
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
    </div>
  );
}

function AccountCard({
  account,
  groups,
  onRemove,
}: {
  account: Account;
  groups: AccountGroup[];
  onRemove: () => void;
}) {
  const platformInfo = {
    douyin: { name: '抖音', icon: '🎵', color: 'var(--platform-douyin)' },
    kuaishou: { name: '快手', icon: '📱', color: 'var(--platform-kuaishou)' },
    xiaohongshu: { name: '小红书', icon: '📕', color: 'var(--platform-xiaohongshu)' },
  };

  const info = platformInfo[account.platform];

  return (
    <div className="card">
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
                     account.status === 'error' ? 'var(--error)' : 'var(--text-muted)',
        }} />
        <span style={{ fontSize: 13 }}>
          {account.status === 'active' ? '正常' :
           account.status === 'error' ? '异常' : '未激活'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {info.name}
        </span>
      </div>

      {/* 分组 */}
      {account.groupId && groups.find(g => g.id === account.groupId) && (
        <div style={{ fontSize: 12, color: groups.find(g => g.id === account.groupId)?.color }}>
          {groups.find(g => g.id === account.groupId)?.name}
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

      {/* 操作 */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        paddingTop: 'var(--space-md)',
        borderTop: '1px solid var(--border-subtle)'
      }}>
        <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12 }}>
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
  const [groupId, setGroupId] = useState<string | undefined>();
  const [tagsInput, setTagsInput] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!username.trim() || !password.trim()) return;

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
      if (result && 'id' in result) {
        onAdded(result);
      }
    } catch (error) {
      console.error('添加账号失败:', error);
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
          <label style={labelStyle}>用户名 / 手机号</label>
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder="输入用户名或手机号"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
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
          <label style={labelStyle}>密码</label>
          <input
            className="input"
            type="password"
            style={{ width: '100%' }}
            placeholder="输入密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
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

  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

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

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个分组吗？')) return;
    try {
      await window.electronAPI?.deleteGroup(id);
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
                      onClick={() => handleDelete(group.id)}
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
