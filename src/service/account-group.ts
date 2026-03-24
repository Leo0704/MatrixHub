import { getDb } from './db.js';
import type { AccountGroup } from '../shared/types.js';
import { v4 as uuid } from 'uuid';

export function createGroup(name: string, color?: string): AccountGroup {
  const db = getDb();
  const now = Date.now();
  const id = uuid();
  const sortOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM account_groups').get() as any).next;

  const group: AccountGroup = {
    id,
    name,
    color: color ?? '#6366f1',
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO account_groups (id, name, color, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, group.color, group.sortOrder, now, now);

  return group;
}

export function updateGroup(id: string, updates: { name?: string; color?: string; sortOrder?: number }): AccountGroup | null {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM account_groups WHERE id = ?').get(id) as any;
  if (!existing) return null;

  const sets: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.color !== undefined) {
    sets.push('color = ?');
    values.push(updates.color);
  }
  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }

  values.push(id);
  db.prepare(`UPDATE account_groups SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return {
    id,
    name: updates.name ?? existing.name,
    color: updates.color ?? existing.color,
    sortOrder: updates.sortOrder ?? existing.sort_order,
    createdAt: existing.created_at,
    updatedAt: now,
  };
}

export function deleteGroup(id: string): boolean {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare('UPDATE accounts SET group_id = NULL WHERE group_id = ?').run(id);
    const result = db.prepare('DELETE FROM account_groups WHERE id = ?').run(id);
    return result.changes > 0;
  });
  return transaction();
}

export function listGroups(): AccountGroup[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM account_groups ORDER BY sort_order ASC, created_at ASC').all() as any[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getGroup(id: string): AccountGroup | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM account_groups WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function reorderGroups(groups: { id: string; sortOrder: number }[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE account_groups SET sort_order = ?, updated_at = ? WHERE id = ?');
  const transaction = db.transaction(() => {
    const now = Date.now();
    for (const g of groups) {
      stmt.run(g.sortOrder, now, g.id);
    }
  });
  transaction();
}
