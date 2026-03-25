import { useState } from 'react';
import type { Account, AccountGroup } from '~shared/types';
import { useToast } from './Toast';

interface EditAccountModalProps {
  account: Account;
  groups: AccountGroup[];
  onClose: () => void;
  onSave: (account: Account) => void;
}

export default function EditAccountModal({
  account,
  groups,
  onClose,
  onSave,
}: EditAccountModalProps) {
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(account.displayName);
  const [groupId, setGroupId] = useState<string | undefined>(account.groupId);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const platformNames = {
    douyin: '🎵 抖音',
    kuaishou: '📱 快手',
    xiaohongshu: '📕 小红书',
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await window.electronAPI?.updateAccount(account.id, {
        username: username.trim() || account.username,
        password: password || undefined,
        displayName: nickname.trim() || account.username,
        groupId,
      });
      if (result && 'id' in result) {
        onSave(result);
      }
    } catch (error) {
      console.error('更新账号失败:', error);
      showToast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 400, maxWidth: '90vw' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>编辑账号</h3>

        {/* 平台 (只读) */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>平台</label>
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
            }}
          >
            {platformNames[account.platform]}
          </div>
        </div>

        {/* 用户名 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>用户名</label>
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder="输入用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        </div>

        {/* 密码 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>密码</label>
          <input
            className="input"
            type="password"
            style={{ width: '100%' }}
            placeholder="留空则不修改"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        {/* 昵称 */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>昵称</label>
          <input
            className="input"
            style={{ width: '100%' }}
            placeholder="选填，默认使用用户名"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
          />
        </div>

        {/* 分组 */}
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
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
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
