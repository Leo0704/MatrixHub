import { useState, useEffect } from 'react';
import type { AccountGroup } from '~shared/types';

interface Props {
  groups: AccountGroup[];
  onClose: () => void;
}

export function GroupManagerModal({ groups, onClose }: Props) {
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

  useEffect(() => {
    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      for (const group of groups) {
        try {
          counts[group.id] = await window.electronAPI?.getGroupAccountCount(group.id) ?? 0;
        } catch { counts[group.id] = 0; }
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
      setNewName(''); setNewColor('#6366f1'); setShowCreate(false);
    } catch (error) { console.error('创建分组失败:', error); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI?.updateGroup(id, { name: editName.trim(), color: editColor });
      setEditingId(null);
    } catch (error) { console.error('更新分组失败:', error); }
    finally { setSaving(false); }
  };

  const handleDeleteClick = async (group: AccountGroup) => {
    setDeleteConfirm({ groupId: group.id, groupName: group.name, count: groupAccountCounts[group.id] || 0 });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await window.electronAPI?.deleteGroup(deleteConfirm.groupId);
      setDeleteConfirm(null);
    } catch (error) { console.error('删除分组失败:', error); }
  };

  const startEdit = (group: AccountGroup) => {
    setEditingId(group.id); setEditName(group.name); setEditColor(group.color);
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div className="card" style={{ width: 480, maxWidth: '90vw' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
            <h3>管理分组</h3>
            <button className="btn btn-ghost" style={{ fontSize: 20 }} onClick={onClose}>×</button>
          </div>

          {showCreate ? (
            <div style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <input className="input" style={{ width: '100%', marginBottom: 'var(--space-sm)' }} placeholder="分组名称" value={newName}
                onChange={e => setNewName(e.target.value)} autoFocus />
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
                {colors.map(c => (
                  <button key={c} style={{ width: 24, height: 24, borderRadius: 'var(--radius-full)', background: c, border: newColor === c ? '2px solid white' : 'none', cursor: 'pointer' }}
                    onClick={() => setNewColor(c)} aria-label={`选择颜色 ${c}`} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowCreate(false)}>取消</button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleCreate} disabled={saving || !newName.trim()}>
                  {saving ? '创建中...' : '创建'}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 'var(--space-lg)', fontSize: 13 }} onClick={() => setShowCreate(true)}>
              + 新建分组
            </button>
          )}

          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {groups.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-lg)' }}>暂无分组</div>
            ) : (
              groups.map(group => (
                <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  {editingId === group.id ? (
                    <>
                      <input className="input" style={{ flex: 1, fontSize: 13 }} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                      <div style={{ display: 'flex', gap: 4 }}>
                        {colors.map(c => (
                          <button key={c} style={{ width: 18, height: 18, borderRadius: 'var(--radius-full)', background: c, border: editColor === c ? '2px solid white' : 'none', cursor: 'pointer' }}
                            onClick={() => setEditColor(c)} aria-label={`选择颜色 ${c}`} />
                        ))}
                      </div>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleUpdate(group.id)} disabled={saving}>保存</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditingId(null)}>取消</button>
                    </>
                  ) : (
                    <>
                      <span style={{ width: 10, height: 10, borderRadius: 'var(--radius-full)', background: group.color }} />
                      <span style={{ flex: 1, fontSize: 13 }}>{group.name}</span>
                      {groupAccountCounts[group.id] > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                          {groupAccountCounts[group.id]} 个账号
                        </span>
                      )}
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => startEdit(group)}>编辑</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--error)' }} onClick={() => handleDeleteClick(group)}>删除</button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
            <button className="btn btn-secondary" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}
          onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', width: 380, border: '1px solid var(--border-subtle)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>确认删除分组</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
              确定要删除分组 "<strong>{deleteConfirm.groupName}</strong>" 吗？
            </p>
            {deleteConfirm.count > 0 && (
              <div style={{ fontSize: 13, padding: 'var(--space-sm) var(--space-md)', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', color: 'var(--warning)' }}>
                ⚠️ 此分组下有 <strong>{deleteConfirm.count}</strong> 个账号，删除后这些账号将变为无分组状态
              </div>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 'var(--space-lg)' }}>此操作无法撤销。</p>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button className="btn btn-danger" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
