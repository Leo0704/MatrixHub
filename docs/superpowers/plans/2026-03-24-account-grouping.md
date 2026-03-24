# 账号分组系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给账号增加分组和标签功能，支持按组管理、筛选、和批量发布

**Architecture:**
- 数据库新增 `account_groups` 表，accounts 表增加 `group_id` 和 `tags` 字段
- 后端新增分组 CRUD 的 IPC handlers；credential-manager 支持 groupId/tags 的增删改查
- 前端账号管理页面增加分组筛选和标签筛选，分组可折叠展示
- 发布任务支持按分组选择账号（前端展开为多个任务）

**Tech Stack:** TypeScript, SQLite (better-sqlite3), React, Electron IPC

---

## 文件改动总览

### 新增文件
- `src/service/account-group.ts` - 分组数据库操作
- `src/service/handlers/group-handlers.ts` - 分组 IPC handler 注册

### 修改文件
- `src/shared/types.ts` - 新增 `AccountGroup` 类型，更新 `Account` 类型
- `src/service/db.ts` - 新增 `account_groups` 表，修改 `accounts` 表
- `src/service/credential-manager.ts` - AccountManager 支持 groupId/tags 增删改、list 支持 groupId 过滤、rowToAccount 解析 tags
- `src/service/ipc-handlers.ts` - 注册分组 handlers
- `src/preload/index.ts` - 暴露分组相关 IPC API；addAccount/updateAccount 增加 groupId/tags
- `src/renderer/pages/AccountManagement.tsx` - 前端分组 UI
- `src/renderer/pages/ContentManagement.tsx` - 发布时选择分组

---

## Task 1: 数据库 Schema 变更

**Files:**
- Modify: `src/service/db.ts`

- [ ] **Step 1: 在 db.ts 的 initializeSchema 函数中，在 accounts 表创建语句之后，新增向后兼容列检查和 ALTER 语句**

在 `CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);` 之后、`// 平台账号表` 注释之前添加：

```typescript
  // 向后兼容：已存在的数据库添加新列（只有列不存在时才添加）
  const accountTableInfo = db.pragma('table_info(accounts)') as { name: string }[];
  const hasGroupId = accountTableInfo.some((col) => col.name === 'group_id');
  const hasTags = accountTableInfo.some((col) => col.name === 'tags');
  if (!hasGroupId) {
    db.exec(`ALTER TABLE accounts ADD COLUMN group_id TEXT`);
  }
  if (!hasTags) {
    db.exec(`ALTER TABLE accounts ADD COLUMN tags TEXT DEFAULT '[]'`);
  }

  // 账号分组表
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
```

- [ ] **Step 2: 提交**
```bash
git add src/service/db.ts
git commit -m "feat: add account_groups table and migrate accounts table columns"
```

---

## Task 2: 类型定义

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 在 types.ts 中，Account interface 前新增 AccountGroup interface，Account interface 中新增 groupId 和 tags 字段**

在 `export interface Account {` 之前插入：

```typescript
export interface AccountGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}
```

更新 `Account` interface（在 `lastUsedAt?: number;` 后添加）：

```typescript
  groupId?: string;
  tags: string[];
```

- [ ] **Step 2: 提交**
```bash
git add src/shared/types.ts
git commit -m "feat: add AccountGroup type and update Account with groupId/tags"
```

---

## Task 3: 分组数据库操作模块

**Files:**
- Create: `src/service/account-group.ts`

- [ ] **Step 1: 创建 src/service/account-group.ts**

```typescript
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
```

- [ ] **Step 2: 提交**
```bash
git add src/service/account-group.ts
git commit -m "feat: add account-group service with CRUD operations"
```

---

## Task 4: CredentialManager 支持 groupId/tags

**Files:**
- Modify: `src/service/credential-manager.ts`

- [ ] **Step 1: 更新 AccountManager.add() 支持 groupId 和 tags 参数**

在 `add()` 函数的 `params` 类型中、`password: string` 后添加：
```typescript
    groupId?: string;
    tags?: string[];
```

在 INSERT 语句中、在 `status,` 之后添加 `group_id, tags,`；在 VALUES 占位符中增加两个 `?`。

**Step 2: 更新 AccountManager.list() 支持 groupId 过滤**

```typescript
  list(options?: { platform?: Platform; groupId?: string }): Account[] {
    const db = getDb();
    let query = 'SELECT * FROM accounts WHERE 1=1';
    const params: any[] = [];
    if (options?.platform) {
      query += ' AND platform = ?';
      params.push(options.platform);
    }
    if (options?.groupId) {
      query += ' AND group_id = ?';
      params.push(options.groupId);
    }
    query += ' ORDER BY created_at DESC';
    const rows = db.prepare(query).all(...params);
    return (rows as any[]).map(r => this.rowToAccount(r));
  }
```

**Step 3: 更新 AccountManager.update() 支持 groupId 和 tags**

```typescript
  update(accountId: string, updates: Partial<Pick<Account, 'displayName' | 'avatar' | 'status' | 'groupId' | 'tags'>>): Account | null {
    const db = getDb();
    const now = Date.now();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.displayName !== undefined) {
      sets.push('display_name = ?');
      values.push(updates.displayName);
    }
    if (updates.avatar !== undefined) {
      sets.push('avatar = ?');
      values.push(updates.avatar);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    if (updates.groupId !== undefined) {
      sets.push('group_id = ?');
      values.push(updates.groupId);
    }
    if (updates.tags !== undefined) {
      sets.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }

    values.push(accountId);
    db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    log.info(`账号更新: ${accountId}`);
    return this.get(accountId);
  }
```

**Step 4: 更新 rowToAccount() 解析 group_id 和 tags**

```typescript
  private rowToAccount(row: any): Account {
    return {
      id: row.id,
      platform: row.platform as Platform,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar ?? undefined,
      status: row.status as Account['status'],
      groupId: row.group_id ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      lastUsedAt: row.last_used_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
```

- [ ] **Step 5: 提交**
```bash
git add src/service/credential-manager.ts
git commit -m "feat: add groupId/tags support to AccountManager"
```

---

## Task 5: IPC Handler 注册

**Files:**
- Modify: `src/service/ipc-handlers.ts`
- Create: `src/service/handlers/group-handlers.ts`

- [ ] **Step 1: 创建 src/service/handlers/group-handlers.ts**

```typescript
import { createGroup, updateGroup, deleteGroup, listGroups, getGroup, reorderGroups } from '../account-group.js';

export function registerGroupHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('group:create', async (_, { name, color }) => {
    return createGroup(name, color);
  });

  ipcMain.handle('group:update', async (_, { id, name, color, sortOrder }) => {
    return updateGroup(id, { name, color, sortOrder });
  });

  ipcMain.handle('group:delete', async (_, { groupId }) => {
    return deleteGroup(groupId);
  });

  ipcMain.handle('group:list', async () => {
    return listGroups();
  });

  ipcMain.handle('group:get', async (_, { groupId }) => {
    return getGroup(groupId);
  });

  ipcMain.handle('group:reorder', async (_, { groups }) => {
    reorderGroups(groups);
    return true;
  });
}
```

- [ ] **Step 2: 在 ipc-handlers.ts 中注册分组 handlers**

读取 `src/service/ipc-handlers.ts`，找到其他 handler 注册的位置（搜索 `register`），在对应位置添加：

```typescript
import { registerGroupHandlers } from './handlers/group-handlers.js';
```

然后在合适的位置调用 `registerGroupHandlers(ipcMain);`。

- [ ] **Step 3: 提交**
```bash
git add src/service/handlers/group-handlers.ts src/service/ipc-handlers.ts
git commit -m "feat: register group IPC handlers"
```

---

## Task 6: Preload API 暴露

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 在 preload/index.ts 中添加分组相关 API 和更新账号相关 API**

在 `contextBridge.exposeInMainWorld('electronAPI', {...})` 中添加：

```typescript
// 分组管理
createGroup: (name: string, color?: string) => ipcRenderer.invoke('group:create', { name, color }),
updateGroup: (id: string, updates: { name?: string; color?: string; sortOrder?: number }) => ipcRenderer.invoke('group:update', { id, ...updates }),
deleteGroup: (groupId: string) => ipcRenderer.invoke('group:delete', { groupId }),
listGroups: () => ipcRenderer.invoke('group:list'),
getGroup: (groupId: string) => ipcRenderer.invoke('group:get', { groupId }),
reorderGroups: (groups: { id: string; sortOrder: number }[]) => ipcRenderer.invoke('group:reorder', { groups }),

// 分组事件监听
onGroupCreated: (callback: (group: any) => void) => ipcRenderer.on('group:created', (_, g) => callback(g)),
onGroupUpdated: (callback: (group: any) => void) => ipcRenderer.on('group:updated', (_, g) => callback(g)),
onGroupDeleted: (callback: (data: { groupId: string }) => void) => ipcRenderer.on('group:deleted', (_, d) => callback(d)),
```

同时更新 `addAccount` 参数类型，增加 `groupId?: string` 和 `tags?: string[]`；`updateAccount` 增加 `groupId` 和 `tags` 支持。

- [ ] **Step 2: 提交**
```bash
git add src/preload/index.ts
git commit -m "feat: expose group APIs in preload"
```

---

## Task 7: 前端 - 账号管理页面分组 UI

**Files:**
- Modify: `src/renderer/pages/AccountManagement.tsx`

- [ ] **Step 1: 添加分组侧边栏和筛选**

在 `AccountManagement` 组件中：
1. `useState` 添加 `groups` state、`selectedGroupId` filter、`showGroupModal` 管理状态
2. `useEffect` 中加载 `listGroups()`
3. 账号列表根据 `selectedGroupId` 过滤（全选时显示所有，选中分组时只显示该分组下的账号）
4. 账号按分组分组展示（如果选了「全部」则按分组折叠展示，每个分组可展开）
5. 添加「管理分组」按钮，打开分组管理弹窗（创建/编辑/删除分组）
6. 卸载时清理 group 事件监听

**分组管理弹窗**（可在 `AccountManagement.tsx` 底部添加 `GroupManagerModal` 子组件）：
- 列出所有分组
- 可创建分组（输入名称、选颜色）
- 可编辑/删除已有分组
- 删除分组后该分组下的账号的 `groupId` 自动清空（后端 `deleteGroup` 处理）

**账号卡片**（`AccountCard`）：在显示信息区下方增加分组名显示（如果有 groupId）。

**添加账号弹窗**（`AddAccountModal`）：在表单中增加分组选择下拉框（调用 `window.electronAPI.listGroups()`），以及标签输入框（逗号分隔的多标签）。

- [ ] **Step 2: 提交**
```bash
git add src/renderer/pages/AccountManagement.tsx
git commit -m "feat: add group filtering and management UI to AccountManagement"
```

---

## Task 8: 前端 - 发布页面支持按分组选择

**Files:**
- Modify: `src/renderer/pages/ContentManagement.tsx`

- [ ] **Step 1: 发布选账号时支持选择分组**

在创建发布任务的表单中，把账号选择改造为：

1. 上方显示「快速选择」：可用分组 chip 按钮，点击展开该分组下的所有账号
2. 下方列表：按平台+分组展示所有可选账号，支持多选
3. 选择分组时自动勾选该组所有账号；取消某个账号时不自动取消组

账号数据通过 `window.electronAPI.listAccounts()` 和 `window.electronAPI.listGroups()` 获取，在前端用 groupId 关联分组。

**Step 2: 提交**
```bash
git add src/renderer/pages/ContentManagement.tsx
git commit -m "feat: support publishing by account group"
```

---

## Task 9: 验证和测试

- [ ] **Step 1: 启动应用验证**

```bash
npm run dev
```

1. 打开账号管理页面，创建几个分组（美妆客户、3C数码、华东地区）
2. 添加新账号时指定分组和标签
3. 用分组筛选验证账号列表正确过滤
4. 编辑账号修改其分组
5. 删除分组验证账号被正确移出分组
6. 在内容管理页面发布时选择分组，验证展开的账号列表正确

- [ ] **Step 2: 提交验证**
```bash
git add -A
git commit -m "test: verify account grouping feature E2E"
```
