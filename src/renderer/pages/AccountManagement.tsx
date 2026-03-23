import { useState } from 'react';
import type { Account, Platform } from '../types';

const mockAccounts: Account[] = [
  {
    id: '1',
    platform: 'douyin',
    username: 'creator_douyin',
    displayName: '创作者小站',
    avatar: undefined,
    status: 'active',
    lastUsedAt: Date.now() - 3600000,
  },
  {
    id: '2',
    platform: 'kuaishou',
    username: 'kuaishou_creator',
    displayName: '快手创作者',
    avatar: undefined,
    status: 'active',
    lastUsedAt: Date.now() - 7200000,
  },
  {
    id: '3',
    platform: 'xiaohongshu',
    username: 'red_note_creator',
    displayName: '小红书号',
    avatar: undefined,
    status: 'error',
    lastUsedAt: Date.now() - 86400000,
  },
];

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>(mockAccounts);
  const [showAddModal, setShowAddModal] = useState(false);

  const addAccount = (platform: Platform) => {
    setShowAddModal(true);
  };

  const removeAccount = (id: string) => {
    setAccounts(accounts.filter(a => a.id !== id));
  };

  const getStatusColor = (status: Account['status']) => {
    switch (status) {
      case 'active':
        return 'var(--success)';
      case 'inactive':
        return 'var(--text-muted)';
      case 'error':
        return 'var(--error)';
    }
  };

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
          {(['douyin', 'kuaishou', 'xiaohongshu'] as Platform[]).map(p => (
            <button
              key={p}
              className="btn btn-secondary"
              style={{ fontSize: 13 }}
              onClick={() => addAccount(p)}
            >
              + 添加{p === 'douyin' ? '抖音' : p === 'kuaishou' ? '快手' : '小红书'}账号
            </button>
          ))}
        </div>
      </div>

      {/* 账号列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)' }}>
        {accounts.map(account => (
          <AccountCard
            key={account.id}
            account={account}
            onRemove={() => removeAccount(account.id)}
          />
        ))}
      </div>
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
        <button
          className="btn btn-secondary"
          style={{ flex: 1, fontSize: 12 }}
        >
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

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}
