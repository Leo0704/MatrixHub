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
  const [showPassword, setShowPassword] = useState(false);
  const [nickname, setNickname] = useState(account.displayName);
  const [groupId, setGroupId] = useState<string | undefined>(account.groupId);
  const [saving, setSaving] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | null>(null);
  const { showToast } = useToast();

  const platformNames = {
    douyin: '🎵 抖音',
  };

  const checkPasswordStrength = (pwd: string) => {
    if (!pwd) { setPasswordStrength(null); return; }
    if (pwd.length < 6) { setPasswordStrength('weak'); return; }
    if (pwd.length >= 12 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) {
      setPasswordStrength('strong');
    } else {
      setPasswordStrength('medium');
    }
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
        showToast('账号更新成功', 'success');
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
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              style={{ width: '100%', paddingRight: 40 }}
              placeholder="留空则不修改"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                checkPasswordStrength(e.target.value);
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                color: 'var(--text-muted)',
                padding: 4
              }}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {password && (
            <div style={{
              fontSize: 11,
              color: passwordStrength === 'weak' ? 'var(--error)' :
                     passwordStrength === 'medium' ? 'var(--warning)' : 'var(--success)',
              marginTop: 4
            }}>
              {passwordStrength === 'weak' && '密码强度: 弱 - 建议至少6位'}
              {passwordStrength === 'medium' && '密码强度: 中等'}
              {passwordStrength === 'strong' && '密码强度: 强'}
            </div>
          )}
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 4
          }}>
            💡 填写新密码将更新现有凭证，留空则保持不变
          </div>
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
