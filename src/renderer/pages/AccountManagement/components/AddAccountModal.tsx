import { useState } from 'react';
import type { Account, AccountGroup, Platform } from '~shared/types';

interface Props {
  groups: AccountGroup[];
  onClose: () => void;
  onAdded: (account: Account) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500,
  color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)',
};

export function AddAccountModal({ groups, onClose, onAdded }: Props) {
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
    setUsernameError(!value.trim() ? '请输入用户名或手机号' : '');
  };

  const validatePassword = (value: string) => {
    if (!value.trim()) { setPasswordError('请输入密码'); return; }
    if (value.length < 6) { setPasswordError('密码至少需要6位'); return; }
    setPasswordError('');
  };

  const handleAdd = async () => {
    if (!username.trim()) { setUsernameError('请输入用户名或手机号'); return; }
    if (!password.trim()) { setPasswordError('请输入密码'); return; }
    if (password.length < 6) { setPasswordError('密码至少需要6位'); return; }

    setAdding(true);
    try {
      const result = await window.electronAPI?.addAccount({
        platform, username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password: password.trim(), groupId,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      });

      if (!result || 'success' in result && !result.success) {
        const errorMsg = (result as { error?: string })?.error || '添加账号失败';
        setPasswordError(errorMsg);
        return;
      }

      const account = result as Account;

      try {
        const validationResult = await window.electronAPI?.validateAccount(account.id);
        if (validationResult && !validationResult.valid) {
          await window.electronAPI?.updateAccount(account.id, { status: 'pending_validation' });
        }
      } catch {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 400, maxWidth: '90vw' }}>
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>添加账号</h3>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>平台</label>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {(['douyin'] as Platform[]).map(p => (
              <button key={p} className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: 13 }} onClick={() => setPlatform(p)}>
                {p === 'douyin' ? '🎵 抖音' : ''}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>分组</label>
          <select className="input" style={{ width: '100%' }} value={groupId ?? ''} onChange={e => setGroupId(e.target.value || undefined)}>
            <option value="">无分组</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>标签</label>
          <input className="input" style={{ width: '100%' }} placeholder="逗号分隔，如: 美妆,种草" value={tagsInput} onChange={e => setTagsInput(e.target.value)} />
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle} htmlFor="username-input">用户名 / 手机号</label>
          <input id="username-input" className={`input ${usernameError ? 'input-error' : ''}`} style={{ width: '100%' }} placeholder="输入用户名或手机号" value={username}
            onChange={e => { setUsername(e.target.value); validateUsername(e.target.value); }}
            aria-describedby={usernameError ? 'username-error' : 'username-help'} aria-invalid={!!usernameError} />
          {usernameError ? (
            <div id="username-error" style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }} role="alert">{usernameError}</div>
          ) : (
            <div id="username-help" className="field-help">支持平台账号密码或Cookie（格式：key=value; key=value）</div>
          )}
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle}>显示名称</label>
          <input className="input" style={{ width: '100%' }} placeholder="选填，默认使用用户名" value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={labelStyle} htmlFor="password-input">密码</label>
          <div style={{ position: 'relative' }}>
            <input id="password-input" className={`input ${passwordError ? 'input-error' : ''}`} type={showPassword ? 'text' : 'password'} style={{ width: '100%', paddingRight: 40 }}
              placeholder="输入密码" value={password}
              onChange={e => { setPassword(e.target.value); checkPasswordStrength(e.target.value); validatePassword(e.target.value); }}
              aria-describedby={passwordError ? 'password-error' : 'password-help'} aria-invalid={!!passwordError} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? '隐藏密码' : '显示密码'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          {passwordError ? (
            <div id="password-error" style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }} role="alert">{passwordError}</div>
          ) : !passwordError && passwordStrength && (
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

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-lg)', padding: 'var(--space-sm)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
          密码将加密存储在系统 Keychain 中
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !username.trim() || !password.trim()}>
            {adding ? '添加中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
