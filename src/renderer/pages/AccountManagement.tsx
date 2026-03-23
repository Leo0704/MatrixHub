import { useState, useEffect } from 'react';
import type { Account, Platform } from '../types';

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadAccounts();

    window.electronAPI?.onAccountAdded((account) => {
      setAccounts(prev => [account, ...prev]);
    });

    window.electronAPI?.onAccountUpdated((account) => {
      setAccounts(prev => prev.map(a => a.id === account.id ? account : a));
    });

    window.electronAPI?.onAccountRemoved(({ accountId }) => {
      setAccounts(prev => prev.filter(a => a.id !== accountId));
    });

    return () => {
      window.electronAPI?.removeAllListeners('account:added');
      window.electronAPI?.removeAllListeners('account:updated');
      window.electronAPI?.removeAllListeners('account:removed');
    };
  }, []);

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
        </div>
      </div>

      {/* 账号列表 */}
      {accounts.length === 0 ? (
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
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onRemove={() => handleRemove(account.id)}
            />
          ))}
        </div>
      )}

      {/* 添加账号弹窗 */}
      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onAdded={(account) => {
            setAccounts([account, ...accounts]);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function AccountCard({
  account,
  onRemove,
}: {
  account: Account;
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
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (account: Account) => void;
}) {
  const [platform, setPlatform] = useState<Platform>('douyin');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!username.trim() || !password.trim()) return;

    setAdding(true);
    try {
      const account = await window.electronAPI?.addAccount({
        platform,
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password: password.trim(),
      });
      if (account) {
        onAdded(account);
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
